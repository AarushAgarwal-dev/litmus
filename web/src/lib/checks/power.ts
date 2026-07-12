/**
 * power.ts, design sensitivity, not post-hoc power.
 *
 * Post-hoc power computed on the *observed* effect is circular (it's just a
 * transform of the p-value), so we don't do it. Instead we report **design
 * sensitivity**: the smallest effect the study was actually powered to find, and
 * the study's power to detect a reference effect of typical size for the field.
 * An underpowered design that "found" a large effect is a hallmark of results
 * that don't replicate.
 */

import { normCdf, normInv } from "../stats";
import type { CheckResult, StatResult, Evidence } from "../types";

const Z_ALPHA = normInv(0.975); // two-sided α = .05

/** Power of a two-sample t-test to detect Cohen's d with n per group. */
export function powerTwoSample(
  d: number,
  nPerGroup: number,
  alpha = 0.05): number {
  const lambda = Math.abs(d) * Math.sqrt(nPerGroup / 2);
  const zc = normInv(1 - alpha / 2);
  return normCdf(lambda - zc) + normCdf(-lambda - zc);
}

/** Smallest d detectable at a target power for a two-sample design. */
export function sensitivityTwoSample(
  nPerGroup: number,
  power = 0.8,
  alpha = 0.05): number {
  return (normInv(1 - alpha / 2) + normInv(power)) / Math.sqrt(nPerGroup / 2);
}

/** Observed Cohen's d from a two-sample t (equal groups). */
export function dFromT(t: number, df: number): number {
  return (2 * Math.abs(t)) / Math.sqrt(df + 2);
}

/** Approximate 95% CI for Cohen's d (two-sample, equal n). */
export function dCI(d: number, nPerGroup: number): [number, number] {
  const n1 = nPerGroup;
  const n2 = nPerGroup;
  const se = Math.sqrt((n1 + n2) / (n1 * n2) + (d * d) / (2 * (n1 + n2)));
  return [d - Z_ALPHA * se, d + Z_ALPHA * se];
}

export function runPower(
  stat: StatResult,
  ev: Evidence,
  typicalD = 0.5): CheckResult | null {
  if (stat.test !== "t" || stat.df1 == null) return null;
  const df = stat.df1;
  const nPerGroup = (df + 2) / 2;
  if (nPerGroup < 2) return null;

  const dObs = stat.effect?.kind === "d" ? stat.effect.value : dFromT(stat.value, df);
  const [ciLo, ciHi] = dCI(dObs, nPerGroup);
  const mde80 = sensitivityTwoSample(nPerGroup, 0.8);
  const powerTypical = powerTwoSample(typicalD, nPerGroup);

  const base = {
    id: `power:${ev.id}`,
    check: "power" as const,
    label: "Power · design sensitivity",
    evidenceId: ev.id,
    locus: ev.locus,
  };

  const recomputation = `n≈${Math.round(nPerGroup)}/group · 80% power only for d ≥ ${mde80.toFixed(
    2)} · power to detect d=${typicalD} ≈ ${(powerTypical * 100).toFixed(0)}%`;

  if (powerTypical < 0.5) {
    return {
      ...base,
      status: "warn",
      severity: mde80 > 1.0 ? "high" : "medium",
      detail: `Underpowered: with ~${Math.round(
        nPerGroup)} per group the study had 80% power only for very large effects (d ≥ ${mde80.toFixed(
        2)}). Power to detect a typical d = ${typicalD} effect was ~${(
        powerTypical * 100
      ).toFixed(
        0)}%. The observed effect (d ≈ ${dObs.toFixed(
        2)}, 95% CI [${ciLo.toFixed(2)}, ${ciHi.toFixed(
        2)}]) is likely inflated, the winner's-curse pattern behind non-replication.`,
      recomputation,
    };
  }
  return {
    ...base,
    status: "pass",
    severity: "info",
    detail: `Adequately powered: ~${(powerTypical * 100).toFixed(
      0)}% power to detect a typical d = ${typicalD} effect; 80% power for d ≥ ${mde80.toFixed(
      2)}. Observed d ≈ ${dObs.toFixed(2)} (95% CI [${ciLo.toFixed(2)}, ${ciHi.toFixed(2)}]).`,
    recomputation,
  };
}
