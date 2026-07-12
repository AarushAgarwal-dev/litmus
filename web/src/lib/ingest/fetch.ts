/**
 * ingest/fetch.ts, turn a DOI into auditable text.
 *
 * OpenAlex gives metadata + abstract for essentially everything; Europe PMC
 * gives full text for the open-access subset. We take full text when we can and
 * fall back to title + abstract otherwise (and say which, honestly).
 */

import { lookupByDoi, type OpenAlexWork } from "../retrieval/openalex";
import { extractTableEvidence } from "../extract/tables";
import type { PaperMeta, Evidence } from "../types";

const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const MAILTO = "litmus-audit@repro.tools";

async function fetchJson(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 12000,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": `Litmus/0.2 (${MAILTO})`, ...(headers ?? {}) },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface IngestResult {
  meta: PaperMeta;
  sourceText: string;
  fullText: boolean;
  topicQuery: string;
  extraEvidence: Evidence[];
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Strip JATS/XML full text to readable prose, dropping references & back-matter. */
function xmlToText(xml: string): string {
  let s = xml;
  s = s.replace(/<ref-list[\s\S]*?<\/ref-list>/gi, " ");
  s = s.replace(/<back[\s\S]*?<\/back>/gi, " ");
  s = s.replace(/<table-wrap[\s\S]*?<\/table-wrap>/gi, " ");
  s = s.replace(/<fig[\s\S]*?<\/fig>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/&[a-z]+;/gi, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Raw JATS full-text XML for an open-access DOI, if available. */
async function europePmcXml(doi: string): Promise<string | null> {
  const search = await fetchText(
    `${EPMC}/search?query=DOI:%22${encodeURIComponent(doi)}%22&format=json&resultType=core`);
  if (!search) return null;
  let data: unknown;
  try {
    data = JSON.parse(search);
  } catch {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hit = (data as any)?.resultList?.result?.[0];
  if (!hit) return null;
  const pmcid = hit.pmcid as string | undefined;
  if (pmcid && (hit.isOpenAccess === "Y" || hit.inEPMC === "Y")) {
    const xml = await fetchText(`${EPMC}/${pmcid}/fullTextXML`);
    if (xml && xml.length > 800) return xml;
  }
  return null;
}

/**
 * Crossref fallback resolver. OpenAlex is the primary metadata source, but if it
 * is down or throttling, an audit must not fail: Crossref covers essentially
 * every DOI and gives us title, authors, year, venue, and (often) an abstract.
 */
async function crossrefWork(doi: string): Promise<OpenAlexWork | null> {
  const raw = await fetchText(
    `https://api.crossref.org/works/${encodeURI(doi)}?mailto=litmus-audit@repro.tools`,
    12000,
  );
  if (!raw) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any;
  try {
    msg = JSON.parse(raw)?.message;
  } catch {
    return null;
  }
  if (!msg?.title?.[0]) return null;
  const authors = (msg.author ?? [])
    .slice(0, 20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => `${a.given ?? ""} ${a.family ?? ""}`.trim())
    .filter(Boolean);
  const year =
    msg.published?.["date-parts"]?.[0]?.[0] ?? msg.issued?.["date-parts"]?.[0]?.[0] ?? undefined;
  const abstract = msg.abstract ? xmlToText(String(msg.abstract)).slice(0, 3000) : undefined;
  return {
    id: doi,
    doi,
    title: msg.title[0],
    authors,
    year,
    venue: msg["container-title"]?.[0],
    citedByCount: msg["is-referenced-by-count"],
    url: `https://doi.org/${doi}`,
    abstract,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as OpenAlexWork;
}

/** Europe PMC metadata resolver (independent of OpenAlex/Crossref infra). */
async function europePmcWork(doi: string): Promise<OpenAlexWork | null> {
  const data = await fetchJson(
    `${EPMC}/search?query=DOI:%22${encodeURIComponent(doi)}%22&format=json&resultType=core`,
  );
  const hit = data?.resultList?.result?.[0];
  if (!hit?.title) return null;
  const authors = hit.authorString
    ? String(hit.authorString).replace(/\.$/, "").split(/,\s*/).slice(0, 20)
    : [];
  return {
    id: doi,
    doi,
    title: hit.title,
    authors,
    year: hit.pubYear ? Number(hit.pubYear) : undefined,
    venue: hit.journalInfo?.journal?.title || hit.journalTitle,
    citedByCount: hit.citedByCount,
    url: `https://doi.org/${doi}`,
    abstract: hit.abstractText ? String(hit.abstractText).slice(0, 3000) : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as OpenAlexWork;
}

/** Semantic Scholar metadata resolver (independent infra; keyless, may throttle). */
async function semanticScholarWork(doi: string): Promise<OpenAlexWork | null> {
  const data = await fetchJson(
    `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=title,year,authors,abstract,venue,citationCount`,
  );
  if (!data?.title) return null;
  return {
    id: doi,
    doi,
    title: data.title,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authors: (data.authors ?? []).slice(0, 20).map((a: any) => a.name).filter(Boolean),
    year: data.year ?? undefined,
    venue: data.venue || undefined,
    citedByCount: data.citationCount,
    url: `https://doi.org/${doi}`,
    abstract: data.abstract ? String(data.abstract).slice(0, 3000) : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as OpenAlexWork;
}

/** Last resort: DOI content negotiation (CSL-JSON) straight from the registrant. */
async function doiOrgWork(doi: string): Promise<OpenAlexWork | null> {
  const data = await fetchJson(`https://doi.org/${encodeURI(doi)}`, {
    Accept: "application/vnd.citationstyles.csl+json",
  });
  if (!data?.title) return null;
  const authors = (data.author ?? [])
    .slice(0, 20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => `${a.given ?? ""} ${a.family ?? ""}`.trim() || a.literal)
    .filter(Boolean);
  return {
    id: doi,
    doi,
    title: Array.isArray(data.title) ? data.title[0] : data.title,
    authors,
    year: data.issued?.["date-parts"]?.[0]?.[0],
    venue: Array.isArray(data["container-title"]) ? data["container-title"][0] : data["container-title"],
    citedByCount: data["is-referenced-by-count"],
    url: `https://doi.org/${doi}`,
    abstract: data.abstract ? xmlToText(String(data.abstract)).slice(0, 3000) : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as OpenAlexWork;
}

/**
 * Resolve DOI metadata through a chain of independent providers, so no single
 * source being down or throttling can fail an audit. Ordered by richness of
 * metadata (abstract-bearing sources first); doi.org content negotiation is the
 * universal last resort. Returns the first hit with a title.
 */
async function resolveWork(doi: string): Promise<OpenAlexWork | null> {
  const resolvers: Array<[string, () => Promise<OpenAlexWork | null>]> = [
    ["OpenAlex", () => lookupByDoi(doi)],
    ["Crossref", () => crossrefWork(doi)],
    ["Europe PMC", () => europePmcWork(doi)],
    ["Semantic Scholar", () => semanticScholarWork(doi)],
    ["doi.org", () => doiOrgWork(doi)],
  ];
  for (const [, run] of resolvers) {
    try {
      const w = await run();
      if (w?.title) return w;
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;

export function normalizeDoi(input: string): string | null {
  const m = DOI_RE.exec(input.trim());
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

export async function ingestDoi(rawDoi: string): Promise<IngestResult | null> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;
  // Resolve through a chain of independent providers (OpenAlex → Crossref →
  // Europe PMC → Semantic Scholar → doi.org) so one being down never fails an audit.
  const work = await resolveWork(doi);
  if (!work) return null;

  const field = "unspecified";
  const meta: PaperMeta = {
    id: doi,
    title: work.title,
    authors: work.authors,
    year: work.year ?? 0,
    venue: work.venue ?? "",
    doi,
    field,
    abstractText: work.abstract,
    labelOutcome: "unknown",
    labelSource: "Live audit",
  };

  const xml = await europePmcXml(doi);
  let full: string | null = null;
  let extraEvidence: Evidence[] = [];
  let tableLines: string[] = [];
  if (xml) {
    const body = xmlToText(xml);
    if (body.length > 800) full = body.slice(0, 200000);
    const tables = extractTableEvidence(xml);
    extraEvidence = tables.evidence;
    tableLines = tables.lines;
  }
  const abstractPart = work.abstract ? `${work.title}\n\n${work.abstract}` : work.title;
  const sourceText =
    (full ? `${work.title}\n\n${full}` : abstractPart) +
    (tableLines.length ? "\n\n" + tableLines.join("\n") : "");

  return {
    meta,
    sourceText,
    fullText: !!full,
    topicQuery: work.title.split(/\s+/).slice(0, 12).join(" "),
    extraEvidence,
  };
}

/** Build an IngestResult from raw pasted text (or an uploaded PDF's text). */
export function ingestText(text: string, title?: string): IngestResult {
  const firstLine = (title || text.split("\n").find((l) => l.trim().length > 12) || "Untitled paper").trim();
  const meta: PaperMeta = {
    id: "text-" + hash(text).toString(36),
    title: firstLine.slice(0, 200),
    authors: [],
    year: 0,
    venue: "",
    field: "unspecified",
    abstractText: text.slice(0, 600),
    labelOutcome: "unknown",
    labelSource: "Live audit (pasted text)",
  };
  return {
    meta,
    sourceText: text.slice(0, 200000),
    fullText: true,
    topicQuery: firstLine.split(/\s+/).slice(0, 12).join(" "),
    extraEvidence: [],
  };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
