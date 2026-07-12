/**
 * retrieval/enrich.ts — DOI-level transparency & provenance signals.
 *
 * Beyond "who else studied this," a reproducibility auditor cares about the
 * paper's own openness and provenance. From a DOI we resolve, from independent
 * live sources:
 *   • Open-access status + a full-text link   (Unpaywall)
 *   • Whether it was posted as a preprint first (bioRxiv / medRxiv)
 *   • Registered clinical trials it names       (ClinicalTrials.gov v2)
 *   • Declared funders                          (Crossref)
 *
 * These become positive/neutral signals with plain-language implications, so the
 * report can say *why* a paper is more or less trustworthy, not just score it.
 */

import type { PaperSignals, CheckResult } from "../types";
import type { MergedWork } from "./sources";

const MAILTO = "litmus-audit@repro.tools";

async function fetchJson(url: string, timeoutMs = 9000, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": `Litmus/0.2 (${MAILTO})`, ...(init?.headers ?? {}) },
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

// DOIs sit in the URL *path* of these APIs and legitimately contain "/" and
// "()". encodeURIComponent would percent-encode the slash (which bioRxiv and
// Crossref reject); encodeURI keeps path-safe characters and encodes the rest.
function doiPath(doi: string): string {
  return encodeURI(doi);
}

function daysBetween(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (!isFinite(t1) || !isFinite(t2)) return undefined;
  return Math.round((t2 - t1) / 86_400_000);
}

/* ---------------- Unpaywall: open-access status ---------------- */

async function unpaywall(doi: string): Promise<Partial<PaperSignals>> {
  const data = await fetchJson(`https://api.unpaywall.org/v2/${doiPath(doi)}?email=${MAILTO}`);
  if (!data) return {};
  const loc = data.best_oa_location ?? {};
  return {
    openAccess: !!data.is_oa,
    oaStatus: data.oa_status ?? (data.is_oa ? "open" : "closed"),
    oaUrl: loc.url_for_pdf || loc.url || undefined,
  };
}

/* ---------------- bioRxiv / medRxiv: preprint provenance ---------------- */

async function preprintLink(doi: string): Promise<Partial<PaperSignals>> {
  for (const server of ["biorxiv", "medrxiv"]) {
    const data = await fetchJson(`https://api.biorxiv.org/pubs/${server}/${doiPath(doi)}`, 10000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = Array.isArray(data?.collection) ? data.collection[0] : undefined;
    if (rec?.preprint_doi) {
      const preprintDate = rec.preprint_date || undefined;
      const publishedDate = rec.published_date || undefined;
      return {
        hasPreprint: true,
        preprintServer: server === "biorxiv" ? "bioRxiv" : "medRxiv",
        preprintDoi: cleanDoi(rec.preprint_doi),
        preprintDate,
        publishedDate,
        daysToPublish: daysBetween(preprintDate, publishedDate),
      };
    }
  }
  return {};
}

/* ---------------- ClinicalTrials.gov v2: registered trials ---------------- */

const CLINICAL_FIELD = /med|clinic|health|psych|trial|epidem|nurs|oncol|cardio|neuro|vaccine|drug|therap/i;

/** NCT registration ids named in the paper text (strongest pre-registration signal). */
export function extractNctIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/\bNCT\s?0*(\d{8})\b/gi)) ids.add(`NCT${m[1]}`);
  return Array.from(ids).slice(0, 5);
}

type RegisteredTrial = NonNullable<PaperSignals["registeredTrials"]>[number];

async function trialById(nctId: string): Promise<RegisteredTrial | null> {
  const data = await fetchJson(`https://clinicaltrials.gov/api/v2/studies/${nctId}`, 10000);
  const p = data?.protocolSection;
  if (!p) return null;
  return {
    nctId,
    title: p.identificationModule?.briefTitle ?? nctId,
    status: p.statusModule?.overallStatus ?? undefined,
    url: `https://clinicaltrials.gov/study/${nctId}`,
  };
}

/* ---------------- Crossref: declared funders ---------------- */

async function crossrefFunders(doi: string): Promise<string[]> {
  // `select=funder` makes Crossref return `message` as an array (malformed for a
  // single work), so we fetch the full record and read the funder list.
  const data = await fetchJson(`https://api.crossref.org/works/${doiPath(doi)}?mailto=${MAILTO}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const funders: any[] = data?.message?.funder ?? [];
  return Array.from(new Set(funders.map((f) => f?.name).filter(Boolean))).slice(0, 6) as string[];
}

/* ---------------- orchestrator ---------------- */

export interface EnrichResult {
  signals: PaperSignals;
  contextWorks: MergedWork[];
}

/**
 * Resolve all DOI-level signals in parallel. `sourceText` is scanned for NCT
 * ids (a paper naming its trial registration is the strongest transparency
 * signal); `field` gates the clinical-registry lookup so we don't attach trial
 * context to, say, a physics paper.
 */
export async function enrichPaper(
  doi: string,
  field: string,
  sourceText: string,
): Promise<EnrichResult> {
  const nctIds = extractNctIds(sourceText);
  const clinical = CLINICAL_FIELD.test(field) || nctIds.length > 0;

  const [oa, pre, funders, trials] = await Promise.all([
    unpaywall(doi),
    preprintLink(doi),
    crossrefFunders(doi),
    clinical
      ? Promise.all(nctIds.map(trialById)).then((rs) => rs.filter((r): r is NonNullable<typeof r> => !!r))
      : Promise.resolve([]),
  ]);

  const signals: PaperSignals = {
    ...oa,
    ...pre,
    funders: funders.length ? funders : undefined,
    registeredTrials: trials.length ? trials : undefined,
  };

  // Surface the preprint itself as a retrievable context work.
  const contextWorks: MergedWork[] = [];
  if (signals.hasPreprint && signals.preprintDoi) {
    contextWorks.push({
      id: signals.preprintDoi,
      doi: signals.preprintDoi,
      title: `Preprint (${signals.preprintServer}) of this work`,
      authors: [],
      year: signals.preprintDate ? Number(signals.preprintDate.slice(0, 4)) || undefined : undefined,
      venue: `${signals.preprintServer} (preprint)`,
      url: `https://doi.org/${signals.preprintDoi}`,
      sources: [signals.preprintServer ?? "preprint"],
    });
  }

  return { signals, contextWorks };
}

/* ---------------- signals → explainable checks ---------------- */

/**
 * Translate the resolved signals into transparency checks. These carry an
 * explicit `implication` (why it matters for reproducibility) and are scored as
 * mild positives by the adjudicator — openness and pre-registration genuinely
 * predict replication, but they are not proof a finding is correct.
 */
export function signalChecks(signals: PaperSignals): CheckResult[] {
  const out: CheckResult[] = [];

  if (signals.registeredTrials?.length) {
    const t = signals.registeredTrials;
    out.push({
      id: "design:registered",
      check: "design",
      label: "Transparency · Pre-registered trial",
      status: "pass",
      severity: "info",
      detail: `Names ${t.length} registered clinical trial${t.length > 1 ? "s" : ""}: ${t
        .map((x) => `${x.nctId}${x.status ? ` (${x.status.toLowerCase().replace(/_/g, " ")})` : ""}`)
        .join(", ")}. The registry record fixes the outcomes and analysis in advance.`,
      implication:
        "Pre-registration constrains researcher degrees of freedom, so the reported test was planned rather than chosen after seeing the data. This is one of the strongest predictors that a result will hold up.",
    });
  }

  if (signals.hasPreprint) {
    const rev =
      signals.daysToPublish != null && signals.daysToPublish > 400
        ? ` The ${signals.daysToPublish}-day gap to publication implies substantial peer-review revision.`
        : "";
    out.push({
      id: "design:preprint",
      check: "design",
      label: "Transparency · Preprint on record",
      status: "pass",
      severity: "info",
      detail: `Posted first on ${signals.preprintServer}${
        signals.preprintDate ? ` (${signals.preprintDate})` : ""
      }.${rev} The pre-review version is public and comparable against the final paper.`,
      implication:
        "A public preprint lets anyone compare the pre- and post-review claims and check for outcome switching between versions. Openness of the record is a positive transparency signal.",
    });
  }

  if (signals.openAccess) {
    out.push({
      id: "design:openaccess",
      check: "design",
      label: "Transparency · Open access",
      status: "pass",
      severity: "info",
      detail: `Full text is open access (${signals.oaStatus ?? "open"}). Independent readers can inspect the methods and results directly.`,
      implication:
        "Open full text means the methods, figures, and supplements can be scrutinized by anyone, not just subscribers. Scrutiny is a prerequisite for reproduction.",
    });
  }

  if (signals.funders?.length) {
    out.push({
      id: "design:funders",
      check: "design",
      label: "Provenance · Declared funders",
      status: "pass",
      severity: "info",
      detail: `Declared funding: ${signals.funders.join("; ")}.`,
      implication:
        "Funding disclosure lets readers judge potential conflicts of interest. It is context, not a defect; industry funding warrants closer reading of the outcome definitions.",
    });
  }

  return out;
}
