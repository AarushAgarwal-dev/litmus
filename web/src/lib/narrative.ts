/**
 * narrative.ts — the explainability layer.
 *
 * Two jobs:
 *   • executiveSummary(): a plain-language "what we found and why" for the whole
 *     audit. When a key is set, Claude writes it, grounded strictly in the facts
 *     Litmus already computed (it explains the verdict, it does not make it).
 *     Otherwise a deterministic template composes the same facts.
 *   • annotateImplications(): fills each check's `implication` — one sentence on
 *     what the pass/fail actually means for reproducibility — so every row in the
 *     report says *why* it matters, not just that it happened.
 */

import type { AuditReport, CheckResult } from "./types";
import { resolveClient, textOut, MODELS, BUDGET, type LLMClient } from "./llm";

/* ------------------------------------------------------------------ */
/* Per-check implications                                              */
/* ------------------------------------------------------------------ */

type ImplFn = (c: CheckResult) => string;

const IMPLICATIONS: Record<string, Partial<Record<CheckResult["status"], string | ImplFn>>> = {
  statcheck: {
    fail: "A p-value that does not recompute from its own test statistic means the reported significance is wrong. Any conclusion drawn from that number is on unstable ground until the discrepancy is explained.",
    warn: "A minor rounding mismatch between the reported and recomputed p-value; probably typographical, but worth a second look.",
    pass: "The reported p-values recompute correctly from their test statistics, so the significance claims are internally consistent.",
  },
  grim: {
    fail: "A reported mean that cannot arise from the stated sample size is an arithmetic impossibility, which points to a transcription or data error rather than a real effect.",
    pass: "The reported means are arithmetically compatible with the stated sample sizes.",
  },
  grimmer: {
    fail: "A mean and standard deviation that cannot coexist for integer data indicate the summary statistics were not computed from a real dataset as described.",
    pass: "The reported mean and SD pairs are internally consistent for integer data.",
  },
  sprite: {
    fail: "No sample of the stated size and bounds can reproduce the reported statistics, so the descriptives are unlikely to reflect the real data.",
    pass: "A plausible sample can reproduce the reported descriptives.",
  },
  power: {
    fail: "The design is underpowered for the effects it claims, so both a significant and a null result are unreliable and unlikely to replicate.",
    warn: "Statistical power looks marginal; the smallest effect this design can reliably detect is larger than what is typically reported here.",
    pass: "The design had adequate power to detect a meaningful effect, so a null result would be informative.",
  },
  pcurve: {
    fail: "The distribution of significant p-values lacks evidential value (flat or left-skewed), the pattern expected from selective reporting rather than a genuine effect.",
    warn: "The p-curve is weaker than a clearly real effect would produce; evidential value is ambiguous.",
    pass: "The p-curve is right-skewed, the signature of a genuine underlying effect across the significant results.",
  },
  reference: {
    fail: "Building on retracted work undermines the foundation of the claim; conclusions inherited from withdrawn results are not safe to rely on.",
    warn: "Some cited support is weak or does not cleanly back the sentence it is attached to.",
    pass: "Cited references resolve and support the statements they back.",
  },
  design: {
    fail: "Missing methodological safeguards let bias inflate the observed effect, which lowers the odds an independent lab reproduces it.",
    warn: "An unreported or absent design safeguard widens the room for the effect to be an artifact rather than real.",
    pass: "A reported design safeguard reduces the room for bias, a modest positive for reproducibility.",
  },
  extrinsic: {
    fail: "The wider literature runs against this claim, including failed replications, which is a strong signal it will not hold.",
    pass: "Independent work in the literature is consistent with this claim.",
  },
  image: {
    fail: "Signs of figure duplication or manipulation cast doubt on the integrity of the reported data.",
    pass: "No figure duplication or manipulation detected.",
  },
};

/** Fill `implication` for any check that lacks one, based on its type + status. */
export function annotateImplications(checks: CheckResult[]): void {
  for (const c of checks) {
    if (c.implication) continue; // signal checks already explain themselves
    const forType = IMPLICATIONS[c.check];
    const entry = forType?.[c.status];
    if (typeof entry === "function") c.implication = entry(c);
    else if (typeof entry === "string") c.implication = entry;
  }
}

/* ------------------------------------------------------------------ */
/* Executive summary                                                  */
/* ------------------------------------------------------------------ */

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** Compact, grounded fact sheet handed to the model (or the template). */
function factSheet(report: AuditReport) {
  const o = report.overall;
  const fails = report.checks.filter((c) => c.status === "fail");
  const warns = report.checks.filter((c) => c.status === "warn");
  // Funders are provenance/COI context, not a point in the paper's favour, so
  // they are deliberately excluded from the "in its favour" transparency set.
  const SIGNAL_IDS = ["design:openaccess", "design:preprint", "design:registered"];
  const transparency = report.checks
    .filter((c) => c.status === "pass" && SIGNAL_IDS.includes(c.id))
    .map((c) => c.label.replace(/^[^·]+·\s*/, "")); // strip the "Transparency · " prefix
  const lit = report.retrieved;
  return {
    title: report.paper.title,
    field: o.field,
    verdict: o.band,
    likelihood: o.band === "abstained" ? "n/a" : pct(o.replicationLikelihood),
    interval: o.band === "abstained" ? "n/a" : `${pct(o.ciLow)} to ${pct(o.ciHigh)}`,
    retracted: o.retracted ?? false,
    retractionReason: o.retractionReason,
    failingChecks: fails.map((c) => ({ label: c.label, detail: c.detail })),
    warningChecks: warns.slice(0, 6).map((c) => ({ label: c.label, detail: c.detail })),
    transparencySignals: transparency,
    claims: report.verdicts.map((v) => {
      const claim = report.claims.find((c) => c.id === v.claimId);
      return {
        text: claim?.text ?? v.claimId,
        verdict: v.band,
        likelihood: v.abstain ? "abstained" : pct(v.replicationLikelihood),
      };
    }),
    literature: {
      total: lit.length,
      contradicting: lit.filter((r) => r.stance === "contradicts").length,
      failedReplications: lit.filter((r) => r.stance === "failed_replication").length,
      supporting: lit.filter((r) => r.stance === "supports").length,
    },
    sourcesQueried:
      o.sourceCount ??
      (report.liveRetrieval?.[0]?.perSource
        ? Object.keys(report.liveRetrieval[0].perSource).length
        : undefined),
  };
}

const SUMMARY_SYSTEM =
  "You are the reporting step of Litmus, a scientific reproducibility auditor. " +
  "You are given a fact sheet of results Litmus already computed for one paper. " +
  "Write a tight executive summary (2 to 3 short paragraphs) for a working scientist deciding whether to trust or build on this paper. " +
  "Explain WHY the verdict is what it is: name the specific checks that failed or passed and what each means for reproducibility, weigh the transparency signals, and note what the wider literature says. " +
  "Ground every statement in the supplied facts. Do NOT invent statistics, p-values, or findings that are not in the fact sheet. If the paper is retracted, lead with that. " +
  "Be precise and plain. No hedging filler, no marketing tone, and do not use em dashes. Output prose only, no headings or bullet lists.";

/**
 * Claude-written executive summary, grounded in the fact sheet. Returns null on
 * any failure so the caller can fall back to the deterministic template.
 */
export async function claudeSummary(report: AuditReport, client?: LLMClient): Promise<string | null> {
  const c = resolveClient(client);
  if (!c) return null;
  try {
    const msg = await c.messages.create({
      model: MODELS.adjudicator,
      max_tokens: BUDGET.narrative,
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: JSON.stringify(factSheet(report), null, 2) }],
        },
      ],
    });
    const text = textOut(msg);
    // Enforce the no-em-dash rule, collapsing the surrounding spaces into ", ".
    return text.length > 40 ? text.replace(/\s*—\s*/g, ", ") : null;
  } catch {
    return null;
  }
}

/** Deterministic executive summary: the same facts, composed by template. */
export function deterministicSummary(report: AuditReport): string {
  const f = factSheet(report);
  const parts: string[] = [];

  if (f.retracted) {
    parts.push(
      `This paper has been retracted${f.retractionReason ? ` (${f.retractionReason.toLowerCase()})` : ""}, which is the strongest possible signal against relying on it. Litmus scores it as unsupported regardless of its internal statistics.`,
    );
  }

  const verdictWord =
    f.verdict === "robust"
      ? "looks robust"
      : f.verdict === "mixed"
        ? "is mixed"
        : f.verdict === "fragile"
          ? "looks fragile"
          : f.verdict === "unsupported"
            ? "is unsupported by the evidence"
            : "could not be scored with confidence";
  parts.push(
    `On balance the central ${f.claims.length === 1 ? "claim" : "claims"} of "${truncate(f.title)}" ${verdictWord}, with a calibrated replication likelihood of ${f.likelihood}${f.interval !== "n/a" ? ` (95% interval ${f.interval})` : ""} in ${f.field}.`,
  );

  if (f.failingChecks.length) {
    parts.push(
      `The verdict is driven down by ${f.failingChecks.length} failed check${f.failingChecks.length > 1 ? "s" : ""}: ${f.failingChecks
        .slice(0, 3)
        .map((c) => `${c.label} (${firstSentence(c.detail)})`)
        .join("; ")}.`,
    );
  } else if (f.warningChecks.length) {
    parts.push(
      `No check failed outright, but ${f.warningChecks.length} raised warnings, chiefly ${f.warningChecks
        .slice(0, 2)
        .map((c) => c.label)
        .join(" and ")}.`,
    );
  } else {
    const statRan = report.checks.some(
      (c) =>
        ["statcheck", "grim", "grimmer", "sprite", "pcurve"].includes(c.check) &&
        c.status !== "na");
    parts.push(
      statRan
        ? "No deterministic check failed, so the reported statistics are internally consistent."
        : "No deterministic check failed, though no recomputable statistics were found to test.");
  }

  if (f.transparencySignals.length) {
    parts.push(`In its favour on transparency: ${f.transparencySignals.join(", ").toLowerCase()}.`);
  }

  if (f.literature.total > 0) {
    const against = f.literature.contradicting + f.literature.failedReplications;
    parts.push(
      against > 0
        ? `The wider literature is not on side: ${against} retrieved work${against > 1 ? "s" : ""} contradict or failed to replicate it, against ${f.literature.supporting} supporting.`
        : `The wider literature offers ${f.literature.supporting} supporting work${f.literature.supporting === 1 ? "" : "s"} and no direct contradiction among the ${f.literature.total} retrieved.`,
    );
  }

  return parts.join(" ");
}

/** Executive summary with Claude if available, else the deterministic template. */
export async function executiveSummary(report: AuditReport, client?: LLMClient): Promise<string> {
  return (await claudeSummary(report, client)) ?? deterministicSummary(report);
}

function truncate(s: string, n = 100): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function firstSentence(s: string): string {
  const m = /[.!?](\s|$)/.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
}
