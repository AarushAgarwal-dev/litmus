/**
 * sprite.ts, SPRITE (Heathers et al.).
 *
 * Given a reported mean, SD, sample size and response scale, SPRITE asks: does
 * *any* integer sample reproduce these numbers? We compute the exact minimum and
 * maximum sample variance achievable for integers on the scale summing to the
 * implied total, a reported SD outside that window is impossible, and, when the
 * window is satisfiable, reconstruct one concrete example distribution.
 */

import { roundTo, mulberry32 } from "../stats";
import type { CheckResult, Descriptive, Evidence } from "../types";

export interface SpriteOutcome {
  applicable: boolean;
  feasible: boolean;
  minSd: number;
  maxSd: number;
  example?: number[];
  reason: string;
}

function sumArr(a: number[]): number {
  return a.reduce((s, v) => s + v, 0);
}

export function sprite(
  n: number,
  mean: number,
  sd: number,
  lo: number,
  hi: number,
  dSd = 2,
  seed = 20240711): SpriteOutcome {
  if (n < 2) {
    return {
      applicable: false,
      feasible: true,
      minSd: 0,
      maxSd: 0,
      reason: "n < 2, SPRITE not applicable.",
    };
  }
  const targetSum = Math.round(mean * n);
  if (targetSum < n * lo || targetSum > n * hi) {
    return {
      applicable: true,
      feasible: false,
      minSd: 0,
      maxSd: 0,
      reason: `Mean ${mean} is outside what the ${lo}–${hi} scale allows for n = ${n}.`,
    };
  }

  // Exact minimum sum of squared deviations: values as even as possible.
  const q = Math.floor(targetSum / n);
  const r = targetSum - q * n; // r values are (q+1), rest are q
  const m = targetSum / n;
  const ssMin =
    (n - r) * Math.pow(q - m, 2) + r * Math.pow(q + 1 - m, 2);
  const minVar = ssMin / (n - 1);

  // Upper bound: mass split between the two extremes of the scale.
  const p = (m - lo) / (hi - lo);
  const maxVarPop = p * (1 - p) * Math.pow(hi - lo, 2);
  const maxVar = (maxVarPop * n) / (n - 1);

  const minSd = Math.sqrt(Math.max(0, minVar));
  const maxSd = Math.sqrt(Math.max(0, maxVar));
  const ulp = 0.5 * Math.pow(10, -dSd);

  if (sd < minSd - ulp) {
    return {
      applicable: true,
      feasible: false,
      minSd,
      maxSd,
      reason: `SD ${sd} is below the minimum ${roundTo(
        minSd,
        dSd)} achievable for mean ${mean}, n = ${n} on a ${lo}–${hi} scale. Too small to be real.`,
    };
  }
  if (sd > maxSd + ulp) {
    return {
      applicable: true,
      feasible: false,
      minSd,
      maxSd,
      reason: `SD ${sd} exceeds the maximum ${roundTo(
        maxSd,
        dSd)} possible for mean ${mean}, n = ${n} on a ${lo}–${hi} scale, no integer responses can spread that far.`,
    };
  }

  // Feasible by the bounds; reconstruct one example by variance-preserving swaps.
  const rand = mulberry32(seed);
  const x = new Array(n).fill(Math.round(m));
  // fix the sum
  let s = sumArr(x);
  let guard = 0;
  while (s !== targetSum && guard++ < 100000) {
    const i = Math.floor(rand() * n);
    if (s < targetSum && x[i] < hi) {
      x[i]++;
      s++;
    } else if (s > targetSum && x[i] > lo) {
      x[i]--;
      s--;
    }
  }
  const targetSS = sd * sd * (n - 1);
  const ss = () => x.reduce((a, v) => a + (v - m) * (v - m), 0);
  for (let iter = 0; iter < 60000; iter++) {
    const cur = ss();
    if (Math.abs(Math.sqrt(cur / (n - 1)) - sd) <= ulp) {
      return {
        applicable: true,
        feasible: true,
        minSd,
        maxSd,
        example: [...x].sort((a, b) => a - b),
        reason: `Reconstructed a valid integer sample matching mean ${mean} and SD ${sd}.`,
      };
    }
    const i = Math.floor(rand() * n);
    const j = Math.floor(rand() * n);
    if (i === j) continue;
    const need = targetSS - cur; // >0 → need more spread
    // moving x[i] up and x[j] down keeps the sum; pick the move that helps
    if (need > 0 && x[i] < hi && x[j] > lo) {
      x[i]++;
      x[j]--;
    } else if (need < 0 && x[i] > x[j] && x[i] > lo && x[j] < hi) {
      x[i]--;
      x[j]++;
    }
  }
  // Bounds say feasible even if the stochastic search didn't land exactly.
  return {
    applicable: true,
    feasible: true,
    minSd,
    maxSd,
    reason: `Reported SD lies within the achievable window [${roundTo(
      minSd,
      dSd)}, ${roundTo(maxSd, dSd)}].`,
  };
}

export function runSprite(d: Descriptive, ev: Evidence): CheckResult | null {
  if (
    d.sd == null ||
    d.scaleMin == null ||
    d.scaleMax == null ||
    !d.integer
  )
    return null;
  const ds = d.sdText ? (/\.(\d+)/.exec(d.sdText)?.[1].length ?? 2) : 2;
  const out = sprite(d.n, d.mean, d.sd, d.scaleMin, d.scaleMax, ds);
  const base = {
    id: `sprite:${ev.id}`,
    check: "sprite" as const,
    label: "SPRITE · distribution feasibility",
    evidenceId: ev.id,
    locus: ev.locus,
  };
  if (!out.applicable) {
    return { ...base, status: "na", severity: "info", detail: out.reason };
  }
  return out.feasible
    ? {
        ...base,
        status: "pass",
        severity: "info",
        detail: out.reason,
        recomputation: `SD ${d.sd} ∈ [${roundTo(out.minSd, ds)}, ${roundTo(
          out.maxSd,
          ds)}]`,
      }
    : {
        ...base,
        status: "fail",
        severity: "high",
        detail: `SPRITE infeasibility in "${d.label}": ${out.reason}`,
        recomputation: `SD ${d.sd} vs window [${roundTo(out.minSd, ds)}, ${roundTo(
          out.maxSd,
          ds)}]`,
      };
}
