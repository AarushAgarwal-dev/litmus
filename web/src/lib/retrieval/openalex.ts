/**
 * openalex.ts, live retrieval against the OpenAlex corpus (250M+ works, no key).
 *
 * Used two ways:
 *   1. searchWorks(), find related work for a claim (the extrinsic-check corpus).
 *   2. lookupByDoi(), confirm a curated reference exists and pull its live
 *      citation count, so demo evidence points at real, verifiable papers.
 */

const BASE = "https://api.openalex.org";
const MAILTO = "litmus-audit@repro.tools"; // OpenAlex "polite pool" contact

export interface OpenAlexWork {
  id: string;
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citedByCount?: number;
  url?: string;
  abstract?: string;
}

function reconstructAbstract(
  inv: Record<string, number[]> | null | undefined): string | undefined {
  if (!inv) return undefined;
  const words: { pos: number; word: string }[] = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const p of positions) words.push({ pos: p, word });
  }
  words.sort((a, b) => a.pos - b.pos);
  const text = words.map((w) => w.word).join(" ");
  return text.length > 1200 ? text.slice(0, 1200) + "…" : text;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapWork(w: any): OpenAlexWork {
  return {
    id: (w.id as string)?.replace("https://openalex.org/", "") ?? "",
    doi: w.doi ? String(w.doi).replace("https://doi.org/", "") : undefined,
    title: w.display_name ?? w.title ?? "(untitled)",
    authors:
      (w.authorships ?? [])
        .slice(0, 8)
        .map((a: any) => a.author?.display_name)
        .filter(Boolean) ?? [],
    year: w.publication_year ?? undefined,
    venue:
      w.primary_location?.source?.display_name ??
      w.host_venue?.display_name ??
      undefined,
    citedByCount: w.cited_by_count ?? undefined,
    url: w.doi ?? w.id,
    abstract: reconstructAbstract(w.abstract_inverted_index),
  };
}

async function fetchJson(url: string, timeoutMs = 9000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": `Litmus/0.1 (${MAILTO})` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const SELECT =
  "id,doi,display_name,publication_year,cited_by_count,authorships,primary_location,abstract_inverted_index";

export async function searchWorks(
  query: string,
  opts: { perPage?: number; fromYear?: number } = {}): Promise<OpenAlexWork[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: String(opts.perPage ?? 8),
    select: SELECT,
    mailto: MAILTO,
    sort: "relevance_score:desc",
  });
  if (opts.fromYear) params.set("filter", `from_publication_date:${opts.fromYear}-01-01`);
  const data = await fetchJson(`${BASE}/works?${params.toString()}`);
  if (!data?.results) return [];
  return data.results.map(mapWork);
}

export async function lookupByDoi(doi: string): Promise<OpenAlexWork | null> {
  const clean = doi.replace(/^https?:\/\/doi\.org\//, "");
  const params = new URLSearchParams({ select: SELECT, mailto: MAILTO });
  const data = await fetchJson(
    `${BASE}/works/https://doi.org/${clean}?${params.toString()}`);
  if (!data?.id) return null;
  return mapWork(data);
}

/** Total works matching a query, a cheap corpus-coverage signal. */
export async function countWorks(query: string): Promise<number> {
  const params = new URLSearchParams({
    search: query,
    per_page: "1",
    mailto: MAILTO,
  });
  const data = await fetchJson(`${BASE}/works?${params.toString()}`);
  return data?.meta?.count ?? 0;
}

export interface WorkDetails {
  work: OpenAlexWork;
  openAlexId: string;
  isRetracted: boolean;
  citedByCount: number;
  relatedWorks: string[];
  referencedWorks: string[];
}

/** Fetch a work by DOI with retraction status, citation count, related + referenced ids. */
export async function workDetails(doi: string): Promise<WorkDetails | null> {
  const clean = doi.replace(/^https?:\/\/doi\.org\//, "");
  const params = new URLSearchParams({
    select: `${SELECT},is_retracted,cited_by_count,related_works,referenced_works`,
    mailto: MAILTO,
  });
  const data = await fetchJson(`${BASE}/works/https://doi.org/${clean}?${params.toString()}`);
  if (!data?.id) return null;
  const strip = (x: string) => String(x).replace("https://openalex.org/", "");
  return {
    work: mapWork(data),
    openAlexId: String(data.id).replace("https://openalex.org/", ""),
    isRetracted: !!data.is_retracted,
    citedByCount: data.cited_by_count ?? 0,
    relatedWorks: (data.related_works ?? []).map(strip),
    referencedWorks: (data.referenced_works ?? []).map(strip),
  };
}

/** Which of the given OpenAlex works are retracted (for reference-integrity). */
export async function retractedAmong(ids: string[]): Promise<{ title: string; doi?: string }[]> {
  const out: { title: string; doi?: string }[] = [];
  for (let i = 0; i < Math.min(ids.length, 150); i += 50) {
    const batch = ids.slice(i, i + 50);
    const params = new URLSearchParams({
      filter: `openalex:${batch.join("|")}`,
      per_page: "50",
      select: "id,doi,display_name,is_retracted",
      mailto: MAILTO,
    });
    const data = await fetchJson(`${BASE}/works?${params.toString()}`);
    for (const w of data?.results ?? [])
      if (w.is_retracted)
        out.push({
          title: w.display_name,
          doi: w.doi ? String(w.doi).replace("https://doi.org/", "") : undefined,
        });
  }
  return out;
}

/** Batch-fetch full works by DOI (used to resolve OpenCitations citing DOIs). */
export async function worksByDois(dois: string[]): Promise<OpenAlexWork[]> {
  if (dois.length === 0) return [];
  const clean = dois.map((d) => d.replace(/^https?:\/\/doi\.org\//i, "")).slice(0, 50);
  const params = new URLSearchParams({
    filter: `doi:${clean.join("|")}`,
    per_page: "50",
    select: SELECT,
    mailto: MAILTO,
  });
  const data = await fetchJson(`${BASE}/works?${params.toString()}`);
  if (!data?.results) return [];
  return data.results.map(mapWork);
}

/** Works that CITE the given OpenAlex work (most-cited first). */
export async function citedBy(openAlexId: string, perPage = 25): Promise<OpenAlexWork[]> {
  const params = new URLSearchParams({
    filter: `cites:${openAlexId}`,
    per_page: String(perPage),
    sort: "cited_by_count:desc",
    select: SELECT,
    mailto: MAILTO,
  });
  const data = await fetchJson(`${BASE}/works?${params.toString()}`);
  if (!data?.results) return [];
  return data.results.map(mapWork);
}

/** Batch-fetch works by OpenAlex id (for related/referenced works). */
export async function worksByIds(ids: string[]): Promise<OpenAlexWork[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams({
    filter: `openalex:${ids.slice(0, 50).join("|")}`,
    per_page: "50",
    select: SELECT,
    mailto: MAILTO,
  });
  const data = await fetchJson(`${BASE}/works?${params.toString()}`);
  if (!data?.results) return [];
  return data.results.map(mapWork);
}
