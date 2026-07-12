/**
 * retrieval/sources.ts — multi-source related-work retrieval.
 *
 * The extrinsic check is only as good as its recall, so we query many free
 * scholarly corpora in parallel (OpenAlex, Crossref, Semantic Scholar, Europe
 * PMC, PubMed, arXiv, DOAJ, DataCite, CORE, OpenAIRE), merge and de-duplicate
 * by DOI/title, and record which sources each work came from. More sources →
 * higher recall → more verifiable verdicts.
 */

import { searchWorks, type OpenAlexWork } from "./openalex";

export interface MergedWork extends OpenAlexWork {
  sources: string[];
}

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

async function fetchText(url: string, timeoutMs = 9000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": `Litmus/0.2 (${MAILTO})` } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function stripTags(s?: string): string | undefined {
  if (!s) return undefined;
  const t = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 1200 ? t.slice(0, 1200) + "…" : t || undefined;
}

function cleanDoi(doi?: string | null): string | undefined {
  if (!doi) return undefined;
  return doi.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase().trim() || undefined;
}

/* ---------------- per-source adapters (all fault-tolerant) ---------------- */

async function fromCrossref(query: string, n: number): Promise<MergedWork[]> {
  const params = new URLSearchParams({
    "query.bibliographic": query,
    rows: String(n),
    select: "DOI,title,author,container-title,published,is-referenced-by-count,abstract",
    mailto: MAILTO,
  });
  const data = await fetchJson(`https://api.crossref.org/works?${params}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.message?.items ?? [];
  return items
    .filter((it) => it.title?.[0])
    .map((it) => ({
      id: cleanDoi(it.DOI) ?? it.DOI,
      doi: cleanDoi(it.DOI),
      title: it.title[0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authors: (it.author ?? []).slice(0, 8).map((a: any) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).filter(Boolean),
      year: it.published?.["date-parts"]?.[0]?.[0],
      venue: it["container-title"]?.[0],
      citedByCount: it["is-referenced-by-count"],
      url: it.DOI ? `https://doi.org/${cleanDoi(it.DOI)}` : undefined,
      abstract: stripTags(it.abstract),
      sources: ["Crossref"],
    }));
}

async function fromSemanticScholar(query: string, n: number): Promise<MergedWork[]> {
  const params = new URLSearchParams({
    query,
    limit: String(Math.min(n, 20)),
    fields: "title,year,authors,abstract,venue,citationCount,externalIds",
  });
  const data = await fetchJson(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.data ?? [];
  return items
    .filter((it) => it.title)
    .map((it) => ({
      id: cleanDoi(it.externalIds?.DOI) ?? `S2:${it.paperId}`,
      doi: cleanDoi(it.externalIds?.DOI),
      title: it.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authors: (it.authors ?? []).slice(0, 8).map((a: any) => a.name).filter(Boolean),
      year: it.year ?? undefined,
      venue: it.venue || undefined,
      citedByCount: it.citationCount ?? undefined,
      url: it.externalIds?.DOI ? `https://doi.org/${cleanDoi(it.externalIds.DOI)}` : undefined,
      abstract: it.abstract ?? undefined,
      sources: ["Semantic Scholar"],
    }));
}

async function fromEuropePmc(query: string, n: number): Promise<MergedWork[]> {
  const params = new URLSearchParams({
    query,
    format: "json",
    pageSize: String(n),
    resultType: "lite",
  });
  const data = await fetchJson(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.resultList?.result ?? [];
  return items
    .filter((it) => it.title)
    .map((it) => ({
      id: cleanDoi(it.doi) ?? `EPMC:${it.id}`,
      doi: cleanDoi(it.doi),
      title: it.title,
      authors: it.authorString ? String(it.authorString).split(/,\s*/).slice(0, 8) : [],
      year: it.pubYear ? Number(it.pubYear) : undefined,
      venue: it.journalTitle || undefined,
      citedByCount: it.citedByCount ?? undefined,
      url: it.doi ? `https://doi.org/${cleanDoi(it.doi)}` : undefined,
      abstract: undefined,
      sources: ["Europe PMC"],
    }));
}

async function fromOpenAlex(query: string, n: number): Promise<MergedWork[]> {
  const works = await searchWorks(query, { perPage: n });
  return works.map((w) => ({ ...w, sources: ["OpenAlex"] }));
}

async function fromPubMed(query: string, n: number): Promise<MergedWork[]> {
  const eutils = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const s = await fetchJson(
    `${eutils}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${n}&retmode=json&sort=relevance`,
  );
  const ids: string[] = s?.esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  const sum = await fetchJson(`${eutils}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = sum?.result ?? {};
  return ids
    .map((id) => result[id])
    .filter(Boolean)
    .map((it) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doi = cleanDoi((it.articleids ?? []).find((a: any) => a.idtype === "doi")?.value);
      return {
        id: doi ?? `PMID:${it.uid}`,
        doi,
        title: it.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authors: (it.authors ?? []).slice(0, 8).map((a: any) => a.name).filter(Boolean),
        year: it.pubdate ? parseInt(String(it.pubdate).slice(0, 4), 10) || undefined : undefined,
        venue: it.fulljournalname || it.source,
        citedByCount: undefined,
        url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${it.uid}/`,
        abstract: undefined,
        sources: ["PubMed"],
      };
    })
    .filter((w) => w.title);
}

async function fromArxiv(query: string, n: number): Promise<MergedWork[]> {
  const xml = await fetchText(
    `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${n}`,
  );
  if (!xml) return [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries
    .map((e) => {
      const title = (/<title>([\s\S]*?)<\/title>/.exec(e)?.[1] ?? "").replace(/\s+/g, " ").trim();
      const summary = (/<summary>([\s\S]*?)<\/summary>/.exec(e)?.[1] ?? "").replace(/\s+/g, " ").trim();
      const year = /<published>(\d{4})/.exec(e)?.[1];
      const idurl = (/<id>([\s\S]*?)<\/id>/.exec(e)?.[1] ?? "").trim();
      const doi = cleanDoi(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/.exec(e)?.[1]);
      const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim()).slice(0, 8);
      return {
        id: doi ?? idurl,
        doi,
        title,
        authors,
        year: year ? Number(year) : undefined,
        venue: "arXiv (preprint)",
        citedByCount: undefined,
        url: idurl || undefined,
        abstract: summary.slice(0, 1200) || undefined,
        sources: ["arXiv"],
      };
    })
    .filter((w) => w.title);
}

async function fromDoaj(query: string, n: number): Promise<MergedWork[]> {
  const data = await fetchJson(
    `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${Math.min(n, 50)}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = data?.results ?? [];
  return results
    .map((r) => {
      const b = r.bibjson ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doi = cleanDoi((b.identifier ?? []).find((i: any) => i.type === "doi")?.id);
      return {
        id: doi ?? `DOAJ:${r.id}`,
        doi,
        title: b.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authors: (b.author ?? []).slice(0, 8).map((a: any) => a.name).filter(Boolean),
        year: b.year ? Number(b.year) : undefined,
        venue: b.journal?.title,
        citedByCount: undefined,
        url: doi ? `https://doi.org/${doi}` : b.link?.[0]?.url,
        abstract: stripTags(b.abstract),
        sources: ["DOAJ"],
      };
    })
    .filter((w) => w.title);
}

async function fromCore(query: string, n: number): Promise<MergedWork[]> {
  const key = process.env.CORE_API_KEY;
  if (!key) return [];
  const data = await fetchJson(
    `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&limit=${Math.min(n, 30)}`,
    12000,
    { Authorization: `Bearer ${key}` },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = data?.results ?? [];
  return results
    .map((r) => {
      const doi = cleanDoi(r.doi);
      return {
        id: doi ?? `CORE:${r.id}`,
        doi,
        title: r.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authors: (r.authors ?? []).slice(0, 8).map((a: any) => a.name).filter(Boolean),
        year: r.yearPublished ?? undefined,
        venue: r.publisher || undefined,
        citedByCount: r.citationCount ?? undefined,
        url: doi ? `https://doi.org/${doi}` : r.downloadUrl,
        abstract: r.abstract ? String(r.abstract).slice(0, 1200) : undefined,
        sources: ["CORE"],
      };
    })
    .filter((w) => w.title);
}

async function fromDataCite(query: string, n: number): Promise<MergedWork[]> {
  const data = await fetchJson(
    `https://api.datacite.org/dois?query=${encodeURIComponent(query)}&page[size]=${Math.min(n, 20)}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.data ?? [];
  return items
    .map((it) => {
      const a = it.attributes ?? {};
      const doi = cleanDoi(a.doi);
      return {
        id: doi ?? it.id,
        doi,
        title: a.titles?.[0]?.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authors: (a.creators ?? []).slice(0, 8).map((c: any) => c.name).filter(Boolean),
        year: a.publicationYear,
        venue: `${a.types?.resourceTypeGeneral ?? "Dataset"} · ${a.publisher ?? "DataCite"}`,
        citedByCount: a.citationCount,
        url: doi ? `https://doi.org/${doi}` : undefined,
        abstract: stripTags(a.descriptions?.[0]?.description),
        sources: ["DataCite"],
      };
    })
    .filter((w) => w.title);
}

/* ---------------- OpenAIRE (EU + global research graph) ---------------- */

// OpenAIRE returns the "dnet" JSON dialect: text lives under a `$` key, most
// fields are either a single object or an array of them, and typed ids sit in a
// `pid` array keyed by `@classid`. These helpers normalize that shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function oafText(x: any): string | undefined {
  if (x == null) return undefined;
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return oafText(x[0]);
  if (typeof x === "object") return x.$ != null ? String(x.$) : oafText(x.content);
  return undefined;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function oafArr(x: any): any[] {
  return x == null ? [] : Array.isArray(x) ? x : [x];
}

async function fromOpenAire(query: string, n: number): Promise<MergedWork[]> {
  const data = await fetchJson(
    `https://api.openaire.eu/search/publications?keywords=${encodeURIComponent(query)}&format=json&size=${Math.min(n, 30)}`,
    12000,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = oafArr(data?.response?.results?.result);
  return results
    .map((r) => {
      const meta = r?.metadata?.["oaf:entity"]?.["oaf:result"];
      if (!meta) return null;
      // Title: prefer the entry classified as the main title.
      const titles = oafArr(meta.title);
      const main = titles.find((t) => t?.["@classid"] === "main title") ?? titles[0];
      const title = oafText(main);
      if (!title) return null;
      const doi = cleanDoi(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oafArr(meta.pid).find((p: any) => p?.["@classid"] === "doi")?.$,
      );
      const dateStr = oafText(meta.dateofacceptance);
      const year = dateStr ? Number(String(dateStr).slice(0, 4)) || undefined : undefined;
      const authors = oafArr(meta.creator)
        .map((c) => oafText(c))
        .filter((s): s is string => !!s)
        .slice(0, 8);
      return {
        id: doi ?? `OpenAIRE:${oafText(meta.originalId) ?? title.slice(0, 40)}`,
        doi,
        title,
        authors,
        year,
        venue: oafText(meta.publisher) || "OpenAIRE",
        citedByCount: undefined,
        url: doi ? `https://doi.org/${doi}` : undefined,
        abstract: stripTags(oafText(meta.description)),
        sources: ["OpenAIRE"],
      } as MergedWork;
    })
    .filter((w): w is MergedWork => !!w);
}

/* ---------------- merge ---------------- */

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface MultiSearchResult {
  works: MergedWork[];
  perSource: Record<string, number>;
}

/** Merge + de-duplicate a combined list of works (DOI first, else title). */
export function dedupeWorks(all: MergedWork[]): { works: MergedWork[]; perSource: Record<string, number> } {
  const perSource: Record<string, number> = {};
  for (const w of all) for (const s of w.sources) perSource[s] = (perSource[s] ?? 0) + 1;

  const byKey = new Map<string, MergedWork>();
  for (const w of all) {
    if (!w.title) continue;
    const key = w.doi ? `doi:${w.doi}` : `t:${normTitle(w.title)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...w });
    } else {
      existing.sources = Array.from(new Set([...existing.sources, ...w.sources]));
      existing.abstract = existing.abstract ?? w.abstract;
      existing.venue = existing.venue ?? w.venue;
      existing.year = existing.year ?? w.year;
      existing.doi = existing.doi ?? w.doi;
      existing.url = existing.url ?? w.url;
      if ((w.citedByCount ?? 0) > (existing.citedByCount ?? 0)) existing.citedByCount = w.citedByCount;
      if (w.authors.length > existing.authors.length) existing.authors = w.authors;
    }
  }
  const works = Array.from(byKey.values()).sort(
    (a, b) => b.sources.length - a.sources.length || (b.citedByCount ?? 0) - (a.citedByCount ?? 0),
  );
  return { works, perSource };
}

/** Query every keyword source in parallel, merge and de-duplicate. */
export async function multiSearch(query: string, perPage = 12): Promise<MultiSearchResult> {
  const settled = await Promise.allSettled([
    fromOpenAlex(query, perPage),
    fromCrossref(query, perPage),
    fromSemanticScholar(query, perPage),
    fromEuropePmc(query, perPage),
    fromPubMed(query, perPage),
    fromArxiv(query, perPage),
    fromDoaj(query, perPage),
    fromDataCite(query, Math.ceil(perPage / 2)),
    fromCore(query, perPage),
    fromOpenAire(query, perPage),
  ]);
  const all: MergedWork[] = [];
  for (const s of settled) if (s.status === "fulfilled") all.push(...s.value);
  return dedupeWorks(all);
}
