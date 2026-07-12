/**
 * provenance.ts — reproducibility-by-manifest.
 *
 * Every audit carries a complete, exportable record of exactly how it was
 * produced: engine version, the model versions used, a fingerprint of the
 * prompt set and deterministic check suite, the scholarly sources actually
 * queried, the retrieval time, and a content hash of the input. This is what
 * lets a scientist or a journal stand behind a Litmus result and re-run it.
 */

import type { AuditReport, ProvenanceManifest } from "./types";
import { MODELS } from "./llm";

/** Bump when the prompt set changes in a way that could move scores. */
export const PROMPT_VERSION = "2026.07-p1";
/** The deterministic check suite in force. Bump when checks are added/changed. */
export const CHECK_SUITE_VERSION =
  "statcheck+grim+grimmer+sprite+power+pcurve+design+reference+signals@1";

/** Small stable string hash (djb2) for the engine fingerprint. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** A fingerprint that changes whenever the scoring-relevant surface changes. */
export function pipelineFingerprint(engineVersion: string): string {
  return djb2(
    [
      engineVersion,
      MODELS.adjudicator,
      MODELS.extractor,
      MODELS.triage,
      PROMPT_VERSION,
      CHECK_SUITE_VERSION,
    ].join("|"),
  );
}

export function buildManifest(report: AuditReport): ProvenanceManifest {
  const o = report.overall;
  const sources = report.liveRetrieval?.[0]?.perSource
    ? Object.keys(report.liveRetrieval[0].perSource)
    : [];
  return {
    engineVersion: report.meta.engineVersion,
    fingerprint: pipelineFingerprint(report.meta.engineVersion),
    generatedAt: report.meta.generatedAt,
    retrievalAt: report.meta.generatedAt,
    adjudicator: o.modelUsed,
    models: {
      adjudicator: MODELS.adjudicator,
      extractor: MODELS.extractor,
      triage: MODELS.triage,
    },
    narrativeByClaude: !!report.meta.narrativeByClaude,
    promptVersion: PROMPT_VERSION,
    checkSuite: CHECK_SUITE_VERSION,
    sources,
    sourceCount: o.sourceCount ?? sources.length,
    claimsAssessed: report.verdicts.filter((v) => !v.abstain).length,
    groundingRate: o.groundingRate,
  };
}

/** A ready-to-cite one-liner for reviews, comments, and papers. */
export function citationString(report: AuditReport, auditId: string): string {
  const p = report.paper;
  const date = new Date(report.meta.generatedAt).toISOString().slice(0, 10);
  const verdict =
    report.overall.band === "abstained"
      ? "abstained"
      : `${report.overall.band} ${Math.round(report.overall.replicationLikelihood * 100)}%`;
  const lead = p.authors?.[0]
    ? `${p.authors[0].split(/\s+/).pop()}${p.authors.length > 1 ? " et al." : ""}`
    : "n.a.";
  const fp = report.manifest?.fingerprint ?? pipelineFingerprint(report.meta.engineVersion);
  return `Litmus reproducibility audit of ${lead}, "${p.title}"${
    p.doi ? ` (doi:${p.doi})` : ""
  }. Verdict: ${verdict}. Litmus engine ${report.meta.engineVersion} [${fp}], ${date}. Audit ${auditId}.`;
}

/** Fill the id/content-hash/citation once they are known (in the API route). */
export function finalizeManifest(
  report: AuditReport,
  auditId: string,
  contentHash: string,
): void {
  if (!report.manifest) report.manifest = buildManifest(report);
  report.manifest.auditId = auditId;
  report.manifest.contentHash = contentHash;
  report.manifest.citation = citationString(report, auditId);
}
