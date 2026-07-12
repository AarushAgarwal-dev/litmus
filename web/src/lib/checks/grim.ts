/**
 * grim.ts, GRIM and GRIMMER.
 *
 * GRIM (Brown & Heathers, 2017): a mean of N integer responses can only land on
 * multiples of 1/N. If a reported mean isn't reachable, the number is impossible
 * as stated.
 *
 * GRIMMER (Anaya, 2016): extends the idea to standard deviations via the parity
 * of the sum of squares. If no integer sample of the given size reproduces both
 * the mean and the SD, the pair is impossible.
 *
 * Both are pure arithmetic, exact, free, and unforgeable.
 */

import { roundTo } from "../stats";
import type { CheckResult, Descriptive, Evidence } from "../types";

export interface GrimOutcome {
  applicable: boolean;
  consistent: boolean;
  granularity: number;
  nearest: number;
  reason: string;
}

export function grim(
  mean: number,
  n: number,
  items = 1,
  decimals = 2): GrimOutcome {
  const N = n * items;
  if (!(N > 0)) {
    return {
      applicable: false,
      consistent: true,
      granularity: Infinity,
      nearest: mean,
      reason: "Sample size is not positive, GRIM not applicable.",
    };
  }
  const granularity = 1 / N;
  const unit = Math.pow(10, -decimals);
  // GRIM is only informative when the achievable step is coarser than the
  // reporting precision; otherwise every reported value is reachable.
  if (granularity <= unit) {
    return {
      applicable: false,
      consistent: true,
      granularity,
      nearest: mean,
      reason: `N = ${N} is too large for GRIM at ${decimals} decimals (granularity ${granularity.toFixed(
        4)} ≤ ${unit}).`,
    };
  }
  let best = Infinity;
  let nearest = mean;
  for (let k = Math.round(mean * N) - 2; k <= Math.round(mean * N) + 2; k++) {
    const recon = k / N;
    const d = Math.abs(roundTo(recon, decimals) - mean);
    if (d < best) {
      best = d;
      nearest = roundTo(recon, decimals);
    }
  }
  const consistent = best <= 1e-9;
  return {
    applicable: true,
    consistent,
    granularity,
    nearest,
    reason: consistent
      ? `Mean ${mean} is reachable from an integer sum over N = ${N}.`
      : `Mean ${mean} is not reachable over N = ${N}; nearest achievable is ${nearest}.`,
  };
}

export interface GrimmerOutcome {
  applicable: boolean;
  consistent: boolean;
  reason: string;
}

export function grimmer(
  mean: number,
  sd: number,
  n: number,
  dMean = 2,
  dSd = 2): GrimmerOutcome {
  const N = n; // GRIMMER assumes single-item integer responses
  if (N < 2) {
    return {
      applicable: false,
      consistent: true,
      reason: "n < 2, GRIMMER needs at least two observations.",
    };
  }
  // First: the mean itself must pass GRIM.
  const g = grim(mean, n, 1, dMean);
  if (g.applicable && !g.consistent) {
    return {
      applicable: true,
      consistent: false,
      reason: `Mean fails GRIM before SD is even considered (${g.reason}).`,
    };
  }
  const sum = Math.round(mean * N);
  const sumSqOverN = (sum * sum) / N;
  // Half-ULP interval implied by the reported SD precision.
  const sdLow = Math.max(0, sd - 0.5 * Math.pow(10, -dSd));
  const sdHigh = sd + 0.5 * Math.pow(10, -dSd);
  const ssLow = sdLow * sdLow * (N - 1) + sumSqOverN;
  const ssHigh = sdHigh * sdHigh * (N - 1) + sumSqOverN;
  const lo = Math.ceil(ssLow - 1e-9);
  const hi = Math.floor(ssHigh + 1e-9);
  if (hi - lo > 200000) {
    return {
      applicable: false,
      consistent: true,
      reason: "SD precision too coarse for a decisive GRIMMER test.",
    };
  }
  for (let sumSq = lo; sumSq <= hi; sumSq++) {
    // parity: for integers, x² ≡ x (mod 2), so Σx² ≡ Σx (mod 2)
    if (((sumSq - sum) % 2 + 2) % 2 !== 0) continue;
    const variance = (sumSq - sumSqOverN) / (N - 1);
    if (variance < 0) continue;
    const sdRecon = Math.sqrt(variance);
    if (Math.abs(roundTo(sdRecon, dSd) - sd) <= 1e-9) {
      return {
        applicable: true,
        consistent: true,
        reason: `An integer sample of size ${N} reproduces mean ${mean} and SD ${sd} (Σx² = ${sumSq}).`,
      };
    }
  }
  return {
    applicable: true,
    consistent: false,
    reason: `No integer sample of size ${N} can produce mean ${mean} together with SD ${sd}. The reported statistics are mutually impossible.`,
  };
}

export function runGrim(d: Descriptive, ev: Evidence): CheckResult {
  const dm = d.meanText ? decimalsOfStr(d.meanText) : 2;
  const out = grim(d.mean, d.n, d.items ?? 1, dm);
  const base = {
    id: `grim:${ev.id}`,
    check: "grim" as const,
    label: "GRIM · mean granularity",
    evidenceId: ev.id,
    locus: ev.locus,
  };
  if (!out.applicable) {
    return { ...base, status: "na", severity: "info", detail: out.reason };
  }
  return out.consistent
    ? {
        ...base,
        status: "pass",
        severity: "info",
        detail: out.reason,
        recomputation: `mean ${d.mean}, n=${d.n} → reachable`,
      }
    : {
        ...base,
        status: "fail",
        severity: "high",
        detail: `GRIM inconsistency in "${d.label}": ${out.reason} A reported mean that no integer data can produce points to a transcription error or fabrication.`,
        recomputation: `mean ${d.mean}, n=${d.n} → nearest achievable ${out.nearest}`,
      };
}

export function runGrimmer(d: Descriptive, ev: Evidence): CheckResult | null {
  if (d.sd == null || !d.integer || (d.items ?? 1) !== 1) return null;
  const dm = d.meanText ? decimalsOfStr(d.meanText) : 2;
  const ds = d.sdText ? decimalsOfStr(d.sdText) : 2;
  const out = grimmer(d.mean, d.sd, d.n, dm, ds);
  const base = {
    id: `grimmer:${ev.id}`,
    check: "grimmer" as const,
    label: "GRIMMER · SD consistency",
    evidenceId: ev.id,
    locus: ev.locus,
  };
  if (!out.applicable) {
    return { ...base, status: "na", severity: "info", detail: out.reason };
  }
  return out.consistent
    ? {
        ...base,
        status: "pass",
        severity: "info",
        detail: out.reason,
        recomputation: `mean ${d.mean}, SD ${d.sd}, n=${d.n} → reproducible`,
      }
    : {
        ...base,
        status: "fail",
        severity: "high",
        detail: `GRIMMER inconsistency in "${d.label}": ${out.reason}`,
        recomputation: `mean ${d.mean}, SD ${d.sd}, n=${d.n} → impossible`,
      };
}

function decimalsOfStr(s: string): number {
  const m = /\.(\d+)/.exec(s);
  return m ? m[1].length : 0;
}
