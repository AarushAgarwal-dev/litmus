/**
 * pcurve.ts, p-curve right-skew test (Simonsohn, Nelson & Simmons).
 *
 * Across a paper's significant focal tests, real effects produce a right-skewed
 * p-curve (many very small p's); p-hacking produces a flat or left-skewed curve.
 * We combine the per-result pp-values with Stouffer's method into a single Z.
 */

import { normInv, normCdf } from "../stats";
import type { CheckResult } from "../types";

export interface PCurveOutcome {
  applicable: boolean;
  k: number;
  z: number;
  pRight: number;
  pLeft: number;
  verdict: "evidential" | "inconclusive" | "hacking";
}

export function pcurve(pValues: number[]): PCurveOutcome {
  const sig = pValues.filter((p) => p > 0 && p < 0.05);
  const k = sig.length;
  if (k < 2) {
    return {
      applicable: false,
      k,
      z: NaN,
      pRight: NaN,
      pLeft: NaN,
      verdict: "inconclusive",
    };
  }
  // Right-skew: pp = p / .05 (uniform under H0 conditional on significance).
  const zRight = sig.map((p) => normInv(Math.min(0.999999, Math.max(1e-6, p / 0.05))));
  const zSumR = zRight.reduce((a, v) => a + v, 0) / Math.sqrt(k);
  const pRight = normCdf(zSumR); // small → right-skewed → evidential value

  // Left-skew (flatness / hacking): pp = (.05 - p) / .05
  const zLeft = sig.map((p) =>
    normInv(Math.min(0.999999, Math.max(1e-6, (0.05 - p) / 0.05))));
  const zSumL = zLeft.reduce((a, v) => a + v, 0) / Math.sqrt(k);
  const pLeft = normCdf(zSumL);

  let verdict: PCurveOutcome["verdict"] = "inconclusive";
  if (pRight < 0.05) verdict = "evidential";
  else if (pLeft < 0.05) verdict = "hacking";

  return { applicable: true, k, z: zSumR, pRight, pLeft, verdict };
}

export function runPcurve(pValues: number[]): CheckResult | null {
  const out = pcurve(pValues);
  const base = {
    id: "pcurve:paper",
    check: "pcurve" as const,
    label: "p-curve · evidential value",
  };
  if (!out.applicable) {
    return {
      ...base,
      status: "na",
      severity: "info",
      detail: `Fewer than two significant focal tests (k = ${out.k}); p-curve is not informative.`,
    };
  }
  const recomputation = `k = ${out.k} · right-skew Z = ${out.z.toFixed(
    2)}, p = ${out.pRight.toFixed(3)}`;
  if (out.verdict === "evidential") {
    return {
      ...base,
      status: "pass",
      severity: "info",
      detail: `The p-curve is significantly right-skewed (Z = ${out.z.toFixed(
        2)}, p = ${out.pRight.toFixed(
        3)}). The significant results carry evidential value, consistent with a real underlying effect.`,
      recomputation,
    };
  }
  if (out.verdict === "hacking") {
    return {
      ...base,
      status: "fail",
      severity: "high",
      detail: `The p-curve is left-skewed (left-skew p = ${out.pLeft.toFixed(
        3)}): p-values bunch just under .05. This is the signature of selective reporting or p-hacking, not a real effect.`,
      recomputation,
    };
  }
  return {
    ...base,
    status: "warn",
    severity: "medium",
    detail: `The p-curve lacks evidential value (right-skew p = ${out.pRight.toFixed(
      3)}, not significant). The significant results are not distinguishable from no true effect.`,
    recomputation,
  };
}
