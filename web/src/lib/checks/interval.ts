/**
 * interval.ts, confidence-interval vs p-value consistency.
 *
 * A reported 95% CI and a reported p-value must agree at α = .05: if the CI
 * excludes the null (1 for ratios like OR/HR, 0 for differences/effects), the
 * result should be significant, and vice versa. A mismatch is a hard reporting
 * error, the CI-analogue of a statcheck decision inconsistency.
 */

import type { CheckResult, Evidence, IntervalResult } from "../types";

export interface CIOutcome {
  applicable: boolean;
  consistent: boolean;
  excludesNull: boolean;
  significant: boolean;
  reason: string;
}

function parseSig(text?: string): { p: number; significant: boolean } | null {
  if (!text) return null;
  const m = /(<=|>=|<|>|=)?\s*(0?\.\d+|\.\d+|\d\.\d+(?:e-?\d+)?)/i.exec(text.trim());
  if (!m) return null;
  const op = m[1] ?? "=";
  const v = parseFloat(m[2].startsWith(".") ? "0" + m[2] : m[2]);
  if (!isFinite(v)) return null;
  const significant = op === "<" || op === "<=" ? v <= 0.05 : op === ">" || op === ">=" ? false : v < 0.05;
  return { p: v, significant };
}

export function checkCI(iv: IntervalResult): CIOutcome {
  const parsed = parseSig(iv.reportedPText);
  if (parsed == null) {
    return { applicable: false, consistent: true, excludesNull: false, significant: false, reason: "No reported p-value to compare against the interval." };
  }
  const { p, significant } = parsed;
  const lo = Math.min(iv.low, iv.high);
  const hi = Math.max(iv.low, iv.high);
  const excludesNull = iv.nullValue < lo || iv.nullValue > hi;
  const consistent = excludesNull === significant;
  return {
    applicable: true,
    consistent,
    excludesNull,
    significant,
    reason: consistent
      ? `The 95% CI [${lo}, ${hi}] ${excludesNull ? "excludes" : "includes"} the null (${iv.nullValue}), consistent with p ${significant ? "<" : "≥"} .05.`
      : excludesNull
        ? `The 95% CI [${lo}, ${hi}] excludes the null (${iv.nullValue}), implying significance, but the reported p = ${p} is not below .05.`
        : `The 95% CI [${lo}, ${hi}] includes the null (${iv.nullValue}), implying non-significance, but the reported p = ${p} is below .05.`,
  };
}

export function runCIConsistency(ev: Evidence): CheckResult | null {
  if (!ev.interval) return null;
  const out = checkCI(ev.interval);
  const base = {
    id: `interval:${ev.id}`,
    check: "statcheck" as const, // grouped with the statistical-forensics family
    label: "CI ↔ p · interval consistency",
    evidenceId: ev.id,
    locus: ev.locus,
  };
  if (!out.applicable) {
    return { ...base, status: "na", severity: "info", detail: out.reason };
  }
  const recomputation = `${ev.interval.effect} = ${ev.interval.point}, 95% CI [${ev.interval.low}, ${ev.interval.high}] vs p ${ev.interval.reportedPText}`;
  return out.consistent
    ? { ...base, status: "pass", severity: "info", detail: out.reason, recomputation }
    : {
        ...base,
        status: "fail",
        severity: "high",
        detail: `Interval inconsistency: ${out.reason}`,
        recomputation,
      };
}
