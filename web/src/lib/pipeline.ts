/**
 * pipeline.ts, orchestrates one audit and streams stage events.
 *
 * Stages: parse → extract → intrinsic checks → extrinsic retrieval → adjudicate
 * → calibrate → grounding guard + adversarial verify → report. The demo cases
 * and real papers share stages 3–7 (`runChecksToReport`); they differ only in
 * how the claim graph is produced (precomputed vs. live ingestion + extraction).
 */

import type {
  StageEvent,
  AuditReport,
  Verdict,
  RetrievedWork,
  LiveRetrieval,
  PaperMeta,
  Claim,
  Evidence,
  DesignAttributes,
  Locus,
  PaperSignals,
} from "./types";
import { runIntrinsicChecks } from "./checks/intrinsic";
import { lookupByDoi } from "./retrieval/openalex";
import { multiSearch, dedupeWorks } from "./retrieval/sources";
import { citationSearch } from "./retrieval/citations";
import { enrichPaper, signalChecks } from "./retrieval/enrich";
import {
  deterministicVerdict,
  ensembleVerdict,
  hasClaudeKey,
  classifyBand,
  fieldPrior,
} from "./adjudicate";
import { fitFieldPlatt, vennAbersInterval } from "./calibration";
import { makeAdjCalib } from "./demo/benchmark";
import { groundingGuard, adversarialVerify, claudeAdversarialVerify } from "./trust";
import { claudeSummary, deterministicSummary, annotateImplications } from "./narrative";
import { buildManifest } from "./provenance";
import { getDemoPaper, buildSourceText, methodsLocus, type DemoPaper } from "./demo/papers";
import { ingestDoi, ingestText } from "./ingest/fetch";
import { claudeClaimGraph, heuristicClaimGraph } from "./extract/claims";
import { classifyStances } from "./extract/stance";
import { claudePdfStats } from "./extract/pdf-vision";
import { INPUT } from "./llm";

const ENGINE_VERSION = "0.2.0";

// The staged delays are purely cosmetic ("watch it think"); scale them down hard
// so perceived speed tracks the real work (network + model), not padding.
const PACE = 0.2;
function sleep(ms: number): Promise<void> {
  if (process.env.NODE_ENV === "test") return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms * PACE));
}

function pipelineCalibrator() {
  return fitFieldPlatt(makeAdjCalib());
}

interface AuditContext {
  meta: PaperMeta;
  claims: Claim[];
  evidence: Evidence[];
  design: DesignAttributes;
  sourceText: string;
  topicQuery: string;
  typicalD?: number;
  curated: RetrievedWork[];
  designAnchor: Locus;
  verifyCuratedDois: boolean;
  classifyLive: boolean;
  doi?: string;
}

/* ------------------------------------------------------------------ */
/* Shared stages 3–7 + assembly                                        */
/* ------------------------------------------------------------------ */

async function* runChecksToReport(ctx: AuditContext): AsyncGenerator<StageEvent> {
  const { meta, claims, evidence, design, sourceText } = ctx;
  let usedClaude = false; // set only if a Claude call actually succeeds

  // ---- 3. intrinsic checks ----
  yield { type: "stage", stage: "intrinsic", status: "start", message: "Running deterministic checks", progress: 0.34 };
  await sleep(300);
  const checks = runIntrinsicChecks(evidence, design, { typicalD: ctx.typicalD });
  const firstStatLocus = evidence.find((e) => e.stat)?.locus;
  for (const c of checks) {
    if (c.check === "design" && !c.locus) c.locus = ctx.designAnchor;
    if (c.check === "pcurve" && !c.locus && firstStatLocus) c.locus = firstStatLocus;
  }
  for (const c of checks.filter((c) => c.status === "fail")) {
    yield {
      type: "log",
      stage: "intrinsic",
      message: `⚑ ${c.label}: ${c.recomputation ?? c.detail.slice(0, 90)}`,
      detail: c.severity,
    };
    await sleep(120);
  }
  const nFail = checks.filter((c) => c.status === "fail").length;
  const nWarn = checks.filter((c) => c.status === "warn").length;
  yield {
    type: "log",
    stage: "intrinsic",
    message: `${checks.filter((c) => c.status !== "na").length} checks run · ${nFail} fail · ${nWarn} warn.`,
  };
  yield { type: "stage", stage: "intrinsic", status: "done", progress: 0.48 };

  // ---- 4. extrinsic retrieval (multi-source) ----
  yield { type: "stage", stage: "retrieve", status: "start", message: "Retrieving related work (OpenAlex, Crossref, Semantic Scholar, Europe PMC)", progress: 0.52 };
  const retrieved: RetrievedWork[] = [...ctx.curated];
  const liveRetrieval: LiveRetrieval[] = [];
  const kw = await multiSearch(ctx.topicQuery, INPUT.retrievePerPage);
  let citationWorks: typeof kw.works = [];
  let signalContext: typeof kw.works = [];
  let signals: PaperSignals | undefined;
  let retracted = false;
  let retractionReason: string | undefined;
  let paperCitedBy: number | undefined;
  if (ctx.doi) {
    const cit = await citationSearch(ctx.doi, INPUT.retrievePerPage);
    citationWorks = cit.works;
    retracted = cit.isRetracted;
    retractionReason = cit.retractionReason;
    paperCitedBy = cit.citedByCount;
    if (citationWorks.length) {
      yield {
        type: "log",
        stage: "retrieve",
        message: `Citation graph: ${citationWorks.length} works citing or related (OpenCitations index: ${cit.openCitationsCount ?? 0} citations).`,
      };
    }
    if (retracted) {
      yield {
        type: "log",
        stage: "retrieve",
        message: `⚑ This paper is flagged RETRACTED${retractionReason ? `: ${retractionReason}` : ""}.`,
      };
    }
    // Reference integrity: does the paper build on retracted work?
    if (cit.retractedReferences.length) {
      checks.push({
        id: "reference:retracted",
        check: "reference",
        label: "References · retracted citations",
        status: "fail",
        severity: "high",
        detail: `This paper cites ${cit.retractedReferences.length} retracted work${
          cit.retractedReferences.length > 1 ? "s" : ""
        }: ${cit.retractedReferences.slice(0, 3).map((r) => r.title).join("; ")}${
          cit.retractedReferences.length > 3 ? "…" : ""
        }. Claims that rest on retracted results are undermined.`,
        locus: ctx.designAnchor,
      });
      yield {
        type: "log",
        stage: "retrieve",
        message: `⚑ Cites ${cit.retractedReferences.length} retracted reference(s).`,
      };
    }

    // Transparency & provenance signals (open access, preprint, registry, funders).
    const enr = await enrichPaper(ctx.doi, meta.field, sourceText);
    signals = enr.signals;
    signalContext = enr.contextWorks;
    const sigChecks = signalChecks(signals);
    for (const c of sigChecks) {
      if (!c.locus) c.locus = ctx.designAnchor;
      checks.push(c);
    }
    design.openAccess = signals.openAccess ?? design.openAccess;
    design.hasPreprint = signals.hasPreprint ?? design.hasPreprint;
    if (signals.registeredTrials?.length) design.registeredTrial = true;
    const sigSummary = [
      signals.openAccess ? `open access (${signals.oaStatus ?? "open"})` : null,
      signals.hasPreprint ? `preprint on ${signals.preprintServer}${signals.preprintDate ? ` ${signals.preprintDate.slice(0, 4)}` : ""}` : null,
      signals.registeredTrials?.length ? `${signals.registeredTrials.length} registered trial(s)` : null,
      signals.funders?.length ? `funders: ${signals.funders.slice(0, 2).join(", ")}${signals.funders.length > 2 ? "…" : ""}` : null,
    ].filter(Boolean);
    if (sigSummary.length) {
      yield {
        type: "log",
        stage: "retrieve",
        message: `Transparency signals: ${sigSummary.join("; ")}.`,
      };
    }
  }
  const { works: live, perSource } = dedupeWorks([...kw.works, ...citationWorks, ...signalContext]);
  const srcSummary = Object.entries(perSource)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  yield {
    type: "log",
    stage: "retrieve",
    message: live.length
      ? `${live.length} unique works across ${Object.keys(perSource).length} sources (${srcSummary}).`
      : `No related works found for this query.`,
  };
  liveRetrieval.push({
    claimId: claims[0]?.id ?? "c1",
    query: ctx.topicQuery,
    count: live.length,
    perSource,
    sample: live.slice(0, 8).map((w) => ({
      title: w.title,
      year: w.year,
      doi: w.doi,
      url: w.url,
      citedByCount: w.citedByCount,
      authors: w.authors,
      sources: w.sources,
    })),
  });
  // Classify live results' stance toward the claim (needs a key; else a no-op).
  if (ctx.classifyLive && live.length) {
    const stances = await classifyStances(claims[0], live.slice(0, INPUT.retrievePerPage));
    if (stances.length) {
      retrieved.push(...stances);
      yield {
        type: "log",
        stage: "retrieve",
        message: `Stance-classified ${stances.length} of ${live.length} retrieved works with Claude.`,
      };
    }
  }
  if (ctx.verifyCuratedDois) {
    for (const r of retrieved.slice(0, 2)) {
      if (!r.doi) continue;
      const found = await lookupByDoi(r.doi);
      if (found) {
        r.citedByCount = found.citedByCount;
        r.url = found.url ?? r.url;
        yield {
          type: "log",
          stage: "retrieve",
          message: `Verified reference live: ${found.title}, ${found.citedByCount ?? "?"} citations.`,
        };
      }
      await sleep(110);
    }
  }
  for (const r of retrieved) {
    const verb =
      r.stance === "failed_replication"
        ? "failed replication"
        : r.stance === "contradicts"
          ? "contradicts"
          : r.stance === "supports"
            ? "supports"
            : "neutral";
    yield { type: "log", stage: "retrieve", message: `${verb} → ${r.title}` };
    await sleep(80);
  }
  if (retrieved.length === 0) {
    yield {
      type: "log",
      stage: "retrieve",
      message: "Stance-classification of retrieved works requires a model key; scoring on intrinsic evidence.",
    };
  }
  yield { type: "stage", stage: "retrieve", status: "done", progress: 0.66 };

  // ---- 5. adjudication ----
  yield {
    type: "stage",
    stage: "adjudicate",
    status: "start",
    message: hasClaudeKey() ? "Adjudicating with Claude (Opus 4.8)" : "Adjudicating (deterministic engine)",
    progress: 0.7,
  };
  await sleep(200);
  if (hasClaudeKey() && claims.length > 1) {
    yield { type: "log", stage: "adjudicate", message: `Adjudicating ${claims.length} claims in parallel...` };
  }
  // Adjudicate every claim concurrently, one model call each, so latency is a
  // single claim's time rather than the sum.
  const rawVerdicts: Verdict[] = await Promise.all(
    claims.map(async (claim) => {
      let v: Verdict | null = null;
      if (hasClaudeKey()) {
        v = await ensembleVerdict(claim, evidence, checks, retrieved, meta.field, undefined, {
          paperCitedBy,
          retracted,
        });
        if (v) usedClaude = true;
      }
      if (!v) v = deterministicVerdict(claim, evidence, checks, retrieved, meta.field);
      return v;
    }),
  );
  for (const v of rawVerdicts) {
    yield {
      type: "log",
      stage: "adjudicate",
      message: `${v.claimId} → raw ${(v.rawScore * 100).toFixed(0)}%${v.abstain ? " (abstain)" : ""}`,
    };
  }
  yield { type: "stage", stage: "adjudicate", status: "done", progress: 0.82 };

  // ---- 6. calibration ----
  yield { type: "stage", stage: "calibrate", status: "start", message: "Calibrating against labeled outcomes", progress: 0.85 };
  await sleep(260);
  const cal = pipelineCalibrator();
  const allCal = makeAdjCalib();
  const fieldCal = allCal.filter((p) => p.field === meta.field);
  const vaPoints = (fieldCal.length >= 20 ? fieldCal : allCal).map((p) => ({
    raw: p.raw,
    outcome: p.outcome,
  }));
  const verdicts: Verdict[] = rawVerdicts.map((v) => {
    const p = cal.predict(v.rawScore, meta.field);
    // Distribution-free interval width from Venn-Abers, floored by evidence thinness.
    const va = vennAbersInterval(vaPoints, v.rawScore);
    const unc = v.abstain
      ? v.uncertainty
      : Math.min(0.5, Math.max(va.width / 2, v.uncertainty * 0.55));
    return {
      ...v,
      replicationLikelihood: p,
      uncertainty: unc,
      ciLow: Math.max(0, p - unc),
      ciHigh: Math.min(1, p + unc),
      band: classifyBand(p, v.abstain),
    };
  });
  yield { type: "log", stage: "calibrate", message: `Per-field Platt calibration + Venn-Abers interval (${meta.field}).` };
  yield { type: "stage", stage: "calibrate", status: "done", progress: 0.9 };

  // ---- 7. grounding guard + adversarial verify ----
  yield { type: "stage", stage: "verify", status: "start", message: "Grounding guard + adversarial verification", progress: 0.93 };
  await sleep(260);
  let totalReasons = 0;
  let keptReasons = 0;
  const guarded: Verdict[] = verdicts.map((v) => {
    const g = groundingGuard(v.topReasons, sourceText);
    totalReasons += v.topReasons.length;
    keptReasons += g.kept.length;
    return { ...v, topReasons: g.kept };
  });
  const droppedReasons = totalReasons - keptReasons;
  const groundingRate = totalReasons ? keptReasons / totalReasons : 1;
  const verifications =
    (hasClaudeKey() ? await claudeAdversarialVerify(checks) : null) ?? adversarialVerify(checks);
  yield {
    type: "log",
    stage: "verify",
    message: `Grounding: ${keptReasons}/${totalReasons} reasons resolved to a source span (${droppedReasons} dropped). ${verifications.length} high-severity findings adversarially verified.`,
  };
  yield { type: "stage", stage: "verify", status: "done", progress: 0.98 };

  // ---- assemble ----
  const central = guarded.filter((v) => {
    const c = claims.find((cl) => cl.id === v.claimId);
    return c?.isCentral && !v.abstain;
  });
  let overallP =
    central.length > 0
      ? central.reduce((a, v) => a + v.replicationLikelihood, 0) / central.length
      : guarded.filter((v) => !v.abstain).reduce((a, v) => a + v.replicationLikelihood, 0) /
        Math.max(1, guarded.filter((v) => !v.abstain).length);
  if (!isFinite(overallP)) overallP = fieldPrior(meta.field);
  const integrityFail = checks.some(
    (c) => (c.check === "grim" || c.check === "grimmer" || c.check === "sprite") && c.status === "fail");
  if (integrityFail) overallP = Math.min(overallP, 0.1);
  // A retracted paper is the strongest possible disconfirmation.
  if (retracted) overallP = Math.min(overallP, 0.03);
  const overallU =
    central.length > 0
      ? central.reduce((a, v) => a + v.uncertainty, 0) / central.length
      : 0.42;
  const anyAbstain = guarded.some((v) => v.abstain);
  // A retracted paper is scored (capped) as unsupported, never "abstained", so
  // the verdict and the summary that describes it cannot contradict each other.
  const overallBand = classifyBand(overallP, !retracted && central.length === 0 && anyAbstain);

  const verifyFirst = [...guarded]
    .sort((a, b) => a.replicationLikelihood - b.replicationLikelihood || b.uncertainty - a.uncertainty)
    .slice(0, 3)
    .map((v) => v.claimId);

  const report: AuditReport = {
    paper: meta,
    claims,
    evidence,
    design,
    checks,
    retrieved,
    verdicts: guarded,
    liveRetrieval,
    verifications,
    droppedReasons,
    signals,
    sourceText: sourceText.slice(0, 48000),
    overall: {
      replicationLikelihood: overallP,
      uncertainty: overallU,
      ciLow: Math.max(0, overallP - overallU),
      ciHigh: Math.min(1, overallP + overallU),
      band: overallBand,
      field: meta.field,
      calibrationNote: `Per-field calibration (${meta.field}), base rate ${Math.round(
        fieldPrior(meta.field) * 100)}%.${integrityFail ? " Score capped: reported statistics were proven arithmetically impossible, so the paper's data integrity is in question." : ""}${retracted ? " This paper is flagged RETRACTED." : ""}`,
      verifyFirst,
      groundingRate,
      modelUsed: usedClaude ? "claude-opus-4-8" : "deterministic-fallback",
      retracted,
      retractionReason,
      sourceCount: Object.keys(perSource).length,
    },
    meta: {
      generatedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      adjudicator: usedClaude ? "claude" : "deterministic-fallback",
      tokensNote: usedClaude
        ? "Paper cached across calls; Opus for adjudication."
        : hasClaudeKey()
          ? "A key is set but the model call did not complete, fell back to the deterministic adjudicator (checks & retrieval are fully real)."
          : "No ANTHROPIC_API_KEY set, deterministic adjudicator (checks & retrieval are fully real).",
    },
  };

  // Explainability: annotate every check with what it means, then compose the
  // grounded executive summary (Claude if a key is set, else deterministic).
  // Record who actually authored it, since the adjudicator and the narrator can
  // independently fall back.
  annotateImplications(report.checks);
  const claudeNarrative = await claudeSummary(report);
  report.narrative = claudeNarrative ?? deterministicSummary(report);
  report.meta.narrativeByClaude = claudeNarrative != null;
  // Provenance manifest (content hash + citation are finalized in the API route,
  // where the canonical input and audit id are known).
  report.manifest = buildManifest(report);
  yield {
    type: "log",
    stage: "verify",
    message: hasClaudeKey()
      ? "Composed a grounded executive summary explaining the verdict."
      : "Composed a deterministic executive summary of the findings.",
  };

  yield { type: "done", report, progress: 1 };
}

/* ------------------------------------------------------------------ */
/* Demo path                                                           */
/* ------------------------------------------------------------------ */

export async function* runDemoAudit(demoId: string): AsyncGenerator<StageEvent> {
  const paper = getDemoPaper(demoId);
  if (!paper) {
    yield { type: "error", message: `Unknown demo paper: ${demoId}` };
    return;
  }
  yield* runDemoPaper(paper);
}

async function* runDemoPaper(paper: DemoPaper): AsyncGenerator<StageEvent> {
  yield { type: "stage", stage: "parse", status: "start", message: "Ingesting document", progress: 0.05 };
  await sleep(340);
  yield {
    type: "log",
    stage: "parse",
    message: `Parsed "${paper.meta.title}", ${paper.evidence.length} evidence items across ${paper.claims.length} central claims.`,
  };
  yield { type: "stage", stage: "parse", status: "done", progress: 0.12 };

  yield { type: "stage", stage: "extract", status: "start", message: "Extracting the claim graph", progress: 0.16 };
  await sleep(380);
  for (const c of paper.claims) {
    yield { type: "log", stage: "extract", message: `Claim ${c.id}: ${c.text}` };
    await sleep(110);
  }
  yield { type: "stage", stage: "extract", status: "done", progress: 0.28 };

  yield* runChecksToReport({
    meta: paper.meta,
    claims: paper.claims,
    evidence: paper.evidence,
    design: paper.design,
    sourceText: buildSourceText(paper),
    topicQuery: paper.topicQuery,
    typicalD: paper.typicalD,
    curated: paper.curated,
    designAnchor: methodsLocus(paper),
    verifyCuratedDois: true,
    classifyLive: false,
    doi: paper.meta.doi,
  });
}

/* ------------------------------------------------------------------ */
/* Real-paper path                                                     */
/* ------------------------------------------------------------------ */

export async function* runRealAudit(input: {
  doi?: string;
  text?: string;
  title?: string;
  pdfBase64?: string;
}): AsyncGenerator<StageEvent> {
  // ---- 1. ingest ----
  yield { type: "stage", stage: "parse", status: "start", message: input.doi ? "Resolving DOI" : "Reading document", progress: 0.05 };
  let ingest;
  if (input.doi) {
    ingest = await ingestDoi(input.doi);
    if (!ingest) {
      yield { type: "error", message: `Could not resolve that DOI to a paper. Check the DOI, or paste the text instead.` };
      return;
    }
  } else if (input.text && input.text.trim().length > 40) {
    ingest = ingestText(input.text, input.title);
  } else {
    yield { type: "error", message: "Provide a DOI, or paste at least a paragraph of the paper's text." };
    return;
  }
  await sleep(200);
  yield {
    type: "log",
    stage: "parse",
    message: `${ingest.fullText ? "Full text" : "Title + abstract"} ingested: "${ingest.meta.title.slice(0, 90)}" (${ingest.sourceText.length.toLocaleString()} chars).`,
  };
  yield { type: "stage", stage: "parse", status: "done", progress: 0.14 };

  // ---- 2. extract claim graph ----
  yield { type: "stage", stage: "extract", status: "start", message: hasClaudeKey() ? "Extracting the claim graph (Claude)" : "Extracting statistics & claim", progress: 0.18 };
  const graph =
    (await claudeClaimGraph(ingest.meta.title, ingest.sourceText)) ??
    heuristicClaimGraph(ingest.meta.title, ingest.sourceText);
  let sourceText = ingest.sourceText;
  // Fold in descriptives parsed from structured tables.
  if (ingest.extraEvidence.length) {
    graph.evidence.push(...ingest.extraEvidence);
    const c1 = graph.claims[0];
    if (c1) c1.evidenceIds = [...c1.evidenceIds, ...ingest.extraEvidence.map((e) => e.id)];
  }
  // Claude PDF vision: read statistics out of figures/tables (key-gated, additive).
  if (input.pdfBase64 && hasClaudeKey()) {
    const vision = await claudePdfStats(input.pdfBase64);
    if (vision.evidence.length) {
      graph.evidence.push(...vision.evidence);
      const c1 = graph.claims[0];
      if (c1) c1.evidenceIds = [...c1.evidenceIds, ...vision.evidence.map((e) => e.id)];
      sourceText += "\n\n" + vision.lines.join("\n");
      yield {
        type: "log",
        stage: "extract",
        message: `Claude PDF vision read ${vision.evidence.length} statistic${vision.evidence.length === 1 ? "" : "s"} from figures/tables.`,
      };
    }
  }
  const nStat = graph.evidence.filter((e) => e.stat).length;
  const nDesc = graph.evidence.filter((e) => e.descriptive).length;
  yield {
    type: "log",
    stage: "extract",
    message: `Extracted ${nStat} reported statistic${nStat === 1 ? "" : "s"}, ${nDesc} descriptive${nDesc === 1 ? "" : "s"}, ${graph.claims.length} claim${graph.claims.length === 1 ? "" : "s"} · field: ${graph.field}.`,
  };
  if (graph.evidence.length === 0) {
    yield {
      type: "log",
      stage: "extract",
      message: "No parseable statistics found in the available text, the verdict will rest on design signals and retrieval.",
    };
  }
  yield { type: "stage", stage: "extract", status: "done", progress: 0.3 };

  const meta: PaperMeta = { ...ingest.meta, field: graph.field };
  const designAnchor: Locus =
    graph.evidence[0]?.locus ?? {
      section: "Paper",
      page: 0,
      quote: sourceText.slice(0, 140),
    };

  yield* runChecksToReport({
    meta,
    claims: graph.claims,
    evidence: graph.evidence,
    design: graph.design,
    sourceText,
    topicQuery: ingest.topicQuery,
    typicalD: graph.typicalD,
    curated: [],
    designAnchor,
    verifyCuratedDois: false,
    classifyLive: true,
    doi: ingest.meta.doi,
  });
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function* runAuditStream(input: {
  demoId?: string;
  doi?: string;
  text?: string;
  title?: string;
  pdfBase64?: string;
}): AsyncGenerator<StageEvent> {
  if (input.demoId) yield* runDemoAudit(input.demoId);
  else if (input.doi) yield* runRealAudit({ doi: input.doi });
  else if (input.text)
    yield* runRealAudit({ text: input.text, title: input.title, pdfBase64: input.pdfBase64 });
  else yield { type: "error", message: "Nothing to audit, provide demoId, doi, or text." };
}

/** Non-streaming convenience (tests / JSON). */
export async function runDemoAuditSync(demoId: string): Promise<AuditReport | null> {
  let report: AuditReport | null = null;
  for await (const ev of runDemoAudit(demoId)) {
    if (ev.type === "done" && ev.report) report = ev.report;
  }
  return report;
}

export type { PaperMeta };
