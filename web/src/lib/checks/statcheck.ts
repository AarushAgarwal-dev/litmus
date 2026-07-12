/**
 * statcheck.ts, recompute p-values from the reported test statistic and df,
 * then flag where the reported p disagrees with the recomputed one. A faithful
 * re-implementation of the logic behind Nuijten & Epskamp's `statcheck`.
 *
 * The math is done here, in code. The LLM only ever *extracts* the numbers.
 */

import {
  pFromT,
  pFromF,
  pFromChi2,
  pFromZ,
  pFromR,
  roundTo,
  decimalsOf,
} from "../stats";
import type { CheckResult, StatResult, Evidence } from "../types";

/** APA-style p formatting: no leading zero, "< .001" for tiny values. */
export function fmtP(p: number): string {
  if (!isFinite(p)) return ", ";
  if (p < 0.001) return "< .001";
  const s = roundTo(p, 3).toFixed(3).replace(/^0/, "");
  return `= ${s}`;
}

function fmtStat(s: StatResult): string {
  switch (s.test) {
    case "t":
      return `t(${s.df1}) = ${s.value}`;
    case "F":
      return `F(${s.df1}, ${s.df2}) = ${s.value}`;
    case "chi2":
      return `χ²(${s.df1}) = ${s.value}`;
    case "r":
      return `r(${(s.n ?? 2) - 2}) = ${s.value}`;
    case "z":
      return `z = ${s.value}`;
  }
}

/** Recompute the two-tailed (or upper-tail) p from a reported statistic. */
export function recomputeP(s: StatResult): number {
  switch (s.test) {
    case "t":
      return pFromT(Math.abs(s.value), s.df1 ?? NaN);
    case "F":
      return pFromF(s.value, s.df1 ?? NaN, s.df2 ?? NaN);
    case "chi2":
      return pFromChi2(s.value, s.df1 ?? NaN);
    case "r":
      return pFromR(s.value, s.n ?? NaN);
    case "z":
      return pFromZ(s.value);
  }
}

interface ReportedP {
  value: number;
  decimals: number;
  comparator: "=" | "<" | ">" | "<=" | ">=";
}

function parseReportedP(s: StatResult): ReportedP | null {
  if (s.reportedPText) {
    const txt = s.reportedPText.trim();
    const m = /^(<=|>=|<|>|=)?\s*(\.?\d+(?:\.\d+)?)$/.exec(txt);
    if (m) {
      const comparator = (m[1] as ReportedP["comparator"]) || "=";
      const numStr = m[2].startsWith(".") ? "0" + m[2] : m[2];
      return {
        value: parseFloat(numStr),
        decimals: decimalsOf(m[2]),
        comparator,
      };
    }
  }
  if (s.reportedP != null) {
    return {
      value: s.reportedP,
      decimals: 3,
      comparator: s.comparator === "~" ? "=" : s.comparator ?? "=",
    };
  }
  return null;
}

export function runStatcheck(stat: StatResult, ev: Evidence): CheckResult {
  const base = {
    id: `statcheck:${ev.id}`,
    check: "statcheck" as const,
    label: "statcheck · p-value recomputation",
    evidenceId: ev.id,
    locus: ev.locus,
  };

  const computed = recomputeP(stat);
  const reported = parseReportedP(stat);

  if (!isFinite(computed)) {
    return {
      ...base,
      status: "na",
      severity: "info",
      detail: "Could not recompute, missing degrees of freedom.",
    };
  }
  if (!reported) {
    return {
      ...base,
      status: "na",
      severity: "info",
      detail: `${fmtStat(stat)} → recomputed p ${fmtP(computed)}. No reported p to compare.`,
      recomputation: `${fmtStat(stat)} → p ${fmtP(computed)}`,
    };
  }

  const oneTailed = computed / 2;
  const recomputation = `${fmtStat(stat)} → p ${fmtP(computed)}; reported p ${
    reported.comparator
  } ${reported.value.toFixed(reported.decimals).replace(/^0/, "")}`;

  // Consistency of the reported *value* with the recomputed one.
  const rTwo = roundTo(computed, reported.decimals);
  const rOne = roundTo(oneTailed, reported.decimals);
  let consistent = false;
  let oneTailedMatch = false;
  const v = reported.value;
  const eps = Math.pow(10, -reported.decimals) / 2 + 1e-9;
  switch (reported.comparator) {
    case "=":
      consistent = Math.abs(rTwo - v) <= eps;
      oneTailedMatch = !consistent && Math.abs(rOne - v) <= eps;
      break;
    case "<":
      consistent = computed < v;
      oneTailedMatch = !consistent && oneTailed < v;
      break;
    case "<=":
      consistent = computed <= v + eps;
      oneTailedMatch = !consistent && oneTailed <= v + eps;
      break;
    case ">":
      consistent = computed > v;
      oneTailedMatch = !consistent && oneTailed > v;
      break;
    case ">=":
      consistent = computed >= v - eps;
      oneTailedMatch = !consistent && oneTailed >= v - eps;
      break;
  }

  // Significance-decision (the "gross error" that flips a conclusion).
  const reportedSig =
    (reported.comparator === "=" && reported.value < 0.05) ||
    ((reported.comparator === "<" || reported.comparator === "<=") &&
      reported.value <= 0.05);
  const reportedNonSig =
    (reported.comparator === "=" && reported.value >= 0.05) ||
    ((reported.comparator === ">" || reported.comparator === ">=") &&
      reported.value >= 0.05);
  const computedSig = computed < 0.05;

  if (consistent) {
    return {
      ...base,
      status: "pass",
      severity: "info",
      detail: "Reported p is consistent with the recomputed value.",
      recomputation,
    };
  }

  // A "gross" (decision-flipping) inconsistency is the important signal, and by
  // default statcheck assumes two-tailed tests, so it takes priority over the
  // benign "maybe one-tailed" reconciliation, which is only noted as a caveat.
  const decisionError =
    (reportedSig && !computedSig) || (reportedNonSig && computedSig);

  if (decisionError) {
    const caveat = oneTailedMatch
      ? " (The reported value would be consistent with a one-tailed test; but no one-tailed test is indicated, and two-tailed is the default.)"
      : "";
    return {
      ...base,
      status: "fail",
      severity: oneTailedMatch ? "high" : "critical",
      detail: `Decision inconsistency: the reported p implies ${
        reportedSig ? "significance" : "non-significance"
      } at α = .05, but the statistic recomputes to p ${fmtP(
        computed)}, the opposite conclusion. This flips the finding.${caveat}`,
      recomputation,
    };
  }

  if (oneTailedMatch) {
    return {
      ...base,
      status: "warn",
      severity: "low",
      detail:
        "Two-tailed recomputation disagrees, but the reported p matches a one-tailed test. Consistent only if a one-tailed test was pre-specified.",
      recomputation,
    };
  }

  return {
    ...base,
    status: "warn",
    severity: "medium",
    detail:
      "Reported p disagrees with the recomputed value, though both fall on the same side of α = .05.",
    recomputation,
  };
}
