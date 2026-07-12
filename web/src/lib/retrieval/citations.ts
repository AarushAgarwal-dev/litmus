/**
 * retrieval/citations.ts — citation-graph retrieval + integrity signals for a DOI.
 *
 * The papers that CITE a study are where replications, critiques, and failed
 * reproductions live, so we pull them from multiple independent citation indices
 * (OpenAlex, Semantic Scholar, OpenCitations). We also check the paper's own
 * cited references for retractions, and fetch the retraction reason when the
 * paper itself is retracted.
 */

import { workDetails, citedBy, worksByIds, worksByDois, retractedAmong } from "./openalex";
import type { MergedWork } from "./sources";

const MAILTO = "litmus-audit@repro.tools";

async function fetchJson(url: string, timeoutMs = 9000, headers?: Record<string, string>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": `Litmus/0.2 (${MAILTO})`, ...headers },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function cleanDoi(doi?: string | null): string | undefined {
  if (!doi) return undefined;
  return doi.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase().trim() || undefined;
}

/* ---------------- Semantic Scholar citations ---------------- */

async function s2Citations(doi: string, n: number): Promise<MergedWork[]> {
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}/citations` +
    `?fields=title,year,authors,abstract,venue,citationCount,externalIds&limit=${Math.min(n, 100)}`;
  const data = await fetchJson(url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.data ?? [];
  return items
    .map((it) => {
      const p = it.citingPaper ?? {};
      const doiC = cleanDoi(p.externalIds?.DOI);
      return {
        id: doiC ?? `S2:${p.paperId}`,
        doi: doiC,
        title: p.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authors: (p.authors ?? []).slice(0, 8).map((a: any) => a.name).filter(Boolean),
        year: p.year ?? undefined,
        venue: p.venue || undefined,
        citedByCount: p.citationCount ?? undefined,
        url: doiC ? `https://doi.org/${doiC}` : undefined,
        abstract: p.abstract ?? undefined,
        sources: ["Semantic Scholar (cites)"],
      } as MergedWork;
    })
    .filter((w) => w.title);
}

/* ---------------- OpenCitations (independent citation index) ---------------- */

async function openCitations(doi: string): Promise<{ count: number; dois: string[] }> {
  // Canonical host is api.opencitations.net; the old opencitations.net/index/api
  // path 301-redirects across origins, which fetch does not always carry cleanly.
  // The citation-count endpoint is tiny and always resolves; the full citation
  // list can be megabytes for heavily-cited papers (and the server may drop the
  // socket), so we fetch it separately with a longer timeout and tolerate failure.
  const enc = encodeURIComponent(doi);
  const [countData, listData] = await Promise.all([
    fetchJson(`https://api.opencitations.net/index/v2/citation-count/doi:${enc}`),
    fetchJson(`https://api.opencitations.net/index/v2/citations/doi:${enc}`, 18000),
  ]);
  let count = 0;
  if (Array.isArray(countData) && countData[0]?.count) count = Number(countData[0].count) || 0;
  const dois: string[] = [];
  if (Array.isArray(listData)) {
    for (const c of listData) {
      const m = /doi:(\S+)/.exec(c.citing ?? "");
      if (m) dois.push(m[1].toLowerCase());
    }
  }
  const uniq = Array.from(new Set(dois));
  if (!count) count = uniq.length;
  return { count, dois: uniq };
}

/* ---------------- retraction reason (Retraction Watch, via main Crossref API) ---------------- */

// Retraction Watch data now lives inside the standard Crossref `updated-by`
// field (the api.labs.crossref.org host was retired). Each entry carries a
// type (retraction / expression_of_concern / correction), a label, a date, and
// the notice DOI, sourced from Retraction Watch.
// Returns retraction status AND reason from Crossref. This is an INDEPENDENT
// signal from OpenAlex's is_retracted, so retraction detection survives an
// OpenAlex outage/throttle (encodeURI keeps the DOI's slash raw for Crossref).
async function crossrefRetraction(
  doi: string,
): Promise<{ retracted: boolean; reason?: string; citedBy?: number }> {
  const data = await fetchJson(`https://api.crossref.org/works/${encodeURI(doi)}?mailto=${MAILTO}`);
  const citedBy =
    typeof data?.message?.["is-referenced-by-count"] === "number"
      ? data.message["is-referenced-by-count"]
      : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any[] = Array.isArray(data?.message?.["updated-by"])
    ? data.message["updated-by"]
    : [];
  const rank = (t?: string) =>
    t === "retraction" ? 0 : t === "removal" ? 1 : t === "expression_of_concern" ? 2 : 3;
  const retractive = updates.filter((u) =>
    ["retraction", "removal", "expression_of_concern"].includes(u?.type),
  );
  if (!retractive.length) return { retracted: false, citedBy };
  const picked = [...retractive].sort((a, b) => rank(a.type) - rank(b.type))[0];
  const label: string =
    picked.label || (picked.type ? String(picked.type).replace(/_/g, " ") : "Update");
  const dp: unknown = picked.updated?.["date-parts"]?.[0];
  const date = Array.isArray(dp)
    ? dp
        .filter((x) => x != null)
        .map((x, i) => (i === 0 ? String(x) : String(x).padStart(2, "0")))
        .join("-")
    : undefined;
  const src = picked.source === "retraction-watch" ? "Retraction Watch" : picked.source;
  const parts = [`${label} notice`];
  if (date) parts.push(`published ${date}`);
  if (src) parts.push(`(source: ${src})`);
  // A formal retraction or removal caps the score; an expression of concern is
  // surfaced as the reason but is not treated as a full retraction.
  return {
    retracted: picked.type === "retraction" || picked.type === "removal",
    reason: parts.join(" ").slice(0, 300),
    citedBy,
  };
}

/* ---------------- main ---------------- */

export interface CitationResult {
  works: MergedWork[];
  isRetracted: boolean;
  openAlexId?: string;
  citedByCount?: number;
  openCitationsCount?: number;
  retractedReferences: { title: string; doi?: string }[];
  retractionReason?: string;
}

export async function citationSearch(doi: string, n = 25): Promise<CitationResult> {
  const [details, oc, cr] = await Promise.all([
    workDetails(doi),
    openCitations(doi),
    crossrefRetraction(doi),
  ]);
  const out: MergedWork[] = [];
  // Retraction from EITHER source (OpenAlex or Crossref), so it survives one being down.
  let isRetracted = cr.retracted;
  let openAlexId: string | undefined;
  let citedByCount: number | undefined;
  let retractedReferences: { title: string; doi?: string }[] = [];

  if (details) {
    isRetracted = isRetracted || details.isRetracted;
    openAlexId = details.openAlexId;
    citedByCount = details.citedByCount ?? cr.citedBy;
    const [citing, related, retractedRefs, ocWorks] = await Promise.all([
      citedBy(details.openAlexId, n),
      worksByIds(details.relatedWorks.slice(0, 15)),
      retractedAmong(details.referencedWorks),
      worksByDois(oc.dois.slice(0, n)),
    ]);
    for (const w of citing) out.push({ ...w, sources: ["OpenAlex (cites)"] });
    for (const w of related) out.push({ ...w, sources: ["OpenAlex (related)"] });
    for (const w of ocWorks) out.push({ ...w, sources: ["OpenCitations (cites)"] });
    retractedReferences = retractedRefs;
  } else if (oc.dois.length) {
    const ocWorks = await worksByDois(oc.dois.slice(0, n));
    for (const w of ocWorks) out.push({ ...w, sources: ["OpenCitations (cites)"] });
  }

  const s2 = await s2Citations(doi, n);
  out.push(...s2);

  const retractionReason = isRetracted ? cr.reason : undefined;
  return {
    works: out,
    isRetracted,
    openAlexId,
    citedByCount: citedByCount ?? cr.citedBy,
    openCitationsCount: oc.count,
    retractedReferences,
    retractionReason,
  };
}
