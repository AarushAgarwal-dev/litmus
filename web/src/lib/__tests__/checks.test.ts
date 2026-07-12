import { describe, it, expect } from "vitest";
import {
  pFromT,
  pFromF,
  pFromChi2,
  pFromZ,
  pFromR,
  normCdf,
  normInv,
} from "../stats";
import { runStatcheck, recomputeP } from "../checks/statcheck";
import { extractStatistics } from "../extract/stats";
import { checkCI } from "../checks/interval";
import { extractConfidenceIntervals } from "../extract/ci";
import { grim, grimmer } from "../checks/grim";
import { sprite } from "../checks/sprite";
import { powerTwoSample, sensitivityTwoSample } from "../checks/power";
import { pcurve } from "../checks/pcurve";
import type { Evidence, StatResult } from "../types";

const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

describe("distributions, known critical values", () => {
  it("z = 1.96 → two-tailed p ≈ .05", () => {
    expect(near(pFromZ(1.959964), 0.05)).toBe(true);
  });
  it("t(14) = 2.145 → p ≈ .05", () => {
    expect(near(pFromT(2.14479, 14), 0.05, 2e-3)).toBe(true);
  });
  it("t(14) = 2.0 → p ≈ .0648", () => {
    expect(near(pFromT(2.0, 14), 0.0648, 2e-3)).toBe(true);
  });
  it("chi2(1) = 3.841 → p ≈ .05", () => {
    expect(near(pFromChi2(3.8415, 1), 0.05, 2e-3)).toBe(true);
  });
  it("F(2,20) = 3.4928 → p ≈ .05", () => {
    expect(near(pFromF(3.4928, 2, 20), 0.05, 2e-3)).toBe(true);
  });
  it("r = .5, n = 30 → p ≈ .0049", () => {
    expect(near(pFromR(0.5, 30), 0.00485, 2e-3)).toBe(true);
  });
  it("normCdf / normInv round-trip", () => {
    expect(near(normCdf(1.959964), 0.975)).toBe(true);
    expect(near(normInv(0.975), 1.959964, 1e-4)).toBe(true);
  });
});

const mkEv = (stat: StatResult): Evidence => ({
  id: "e1",
  kind: "stat",
  text: "test",
  stat,
  locus: { section: "Results", page: 1, quote: "test" },
});

describe("statcheck, decision inconsistency", () => {
  it("flags t(14)=2.0 reported as p=.01 as a critical decision error", () => {
    const stat: StatResult = { test: "t", value: 2.0, df1: 14, reportedPText: ".01" };
    const r = runStatcheck(stat, mkEv(stat));
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("critical");
  });
  it("flags the one-tailed-coincidence case (p=.03) as fail but only high severity", () => {
    const stat: StatResult = { test: "t", value: 2.0, df1: 14, reportedPText: ".03" };
    const r = runStatcheck(stat, mkEv(stat));
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("high");
  });
  it("passes a correctly reported p", () => {
    const stat: StatResult = { test: "t", value: 2.0, df1: 14, reportedPText: ".065" };
    const r = runStatcheck(stat, mkEv(stat));
    expect(r.status).toBe("pass");
  });
  it("recomputes p for an F test", () => {
    expect(near(recomputeP({ test: "F", value: 3.4928, df1: 2, df2: 20 }), 0.05, 2e-3)).toBe(
      true);
  });
});

describe("GRIM", () => {
  it("mean 5.19 with n=28 is impossible", () => {
    expect(grim(5.19, 28, 1, 2).consistent).toBe(false);
  });
  it("mean 5.18 with n=28 is reachable", () => {
    expect(grim(5.18, 28, 1, 2).consistent).toBe(true);
  });
  it("is not applicable when n is large", () => {
    expect(grim(5.19, 500, 1, 2).applicable).toBe(false);
  });
});

describe("GRIMMER", () => {
  it("accepts a real integer sample (mean 3.00, sd 1.58, n=5)", () => {
    expect(grimmer(3.0, 1.58, 5, 2, 2).consistent).toBe(true);
  });
  it("rejects an impossible mean/sd pair (mean 3.00, sd 0.50, n=5)", () => {
    expect(grimmer(3.0, 0.5, 5, 2, 2).consistent).toBe(false);
  });
});

describe("SPRITE", () => {
  it("rejects an SD too large for the scale (mean 1.1, sd 2.0, 1–7, n=20)", () => {
    expect(sprite(20, 1.1, 2.0, 1, 7).feasible).toBe(false);
  });
  it("accepts a feasible SD (mean 1.1, sd 0.4, 1–7, n=20)", () => {
    expect(sprite(20, 1.1, 0.4, 1, 7).feasible).toBe(true);
  });
});

describe("degenerate-input guards (no false fabrication verdicts)", () => {
  it("GRIM on n=0 is not applicable, not a failure", () => {
    const g = grim(3.0, 0, 1, 2);
    expect(g.applicable).toBe(false);
    expect(g.consistent).toBe(true);
  });
  it("GRIMMER on n=1 is not applicable, not a failure", () => {
    const g = grimmer(3.0, 0.5, 1, 2, 2);
    expect(g.applicable).toBe(false);
    expect(g.consistent).toBe(true);
  });
  it("SPRITE on n=1 is not applicable and yields no NaN bounds", () => {
    const s = sprite(1, 3, 1, 1, 5);
    expect(s.applicable).toBe(false);
    expect(Number.isNaN(s.minSd)).toBe(false);
  });
});

describe("power / sensitivity", () => {
  it("n=8/group → 80% power only for d ≥ ~1.40", () => {
    expect(near(sensitivityTwoSample(8, 0.8), 1.401, 0.02)).toBe(true);
  });
  it("small n has low power for a typical effect", () => {
    expect(powerTwoSample(0.5, 8)).toBeLessThan(0.3);
  });
  it("large n has high power for a typical effect", () => {
    expect(powerTwoSample(0.5, 200)).toBeGreaterThan(0.9);
  });
});

describe("statistics extraction (real-paper formats)", () => {
  it("extracts a correlation reported without parentheses (r = .34, n = 42)", () => {
    const { evidence } = extractStatistics(
      "Baseline diversity correlated with response, r = .34, n = 42, p = .02.",
    );
    const r = evidence.find((e) => e.stat?.test === "r");
    expect(r).toBeTruthy();
    expect(r!.stat!.n).toBe(42);
    expect(r!.stat!.value).toBeCloseTo(0.34, 5);
  });
  it("extracts a t with a separately reported df (t = 2.35, df = 28)", () => {
    const { evidence } = extractStatistics("The effect held, t = 2.35, df = 28, p = .03.");
    const t = evidence.find((e) => e.stat?.test === "t");
    expect(t!.stat!.df1).toBe(28);
    expect(t!.stat!.value).toBeCloseTo(2.35, 5);
  });
  it("still extracts classic t(df) and F(df1,df2)", () => {
    const { evidence } = extractStatistics("t(14) = 2.0, p = .03. Then F(2, 45) = 3.1, p = .05.");
    expect(evidence.filter((e) => e.stat).length).toBe(2);
  });
  it("does not extract a bare 'r =' or 't =' without a p-value", () => {
    const { evidence } = extractStatistics("The runtime was t = 3 seconds and r = .5 overall.");
    expect(evidence.filter((e) => e.stat).length).toBe(0);
  });
});

describe("CI ↔ p-value consistency", () => {
  it("flags a CI that excludes the null while p is non-significant", () => {
    const o = checkCI({ effect: "OR", point: 1.8, low: 1.1, high: 2.9, nullValue: 1, reportedPText: "= .09" });
    expect(o.consistent).toBe(false);
  });
  it("flags a CI that includes the null while p is significant", () => {
    const o = checkCI({ effect: "d", point: 0.4, low: -0.1, high: 0.9, nullValue: 0, reportedPText: "= .02" });
    expect(o.consistent).toBe(false);
  });
  it("passes a consistent interval and p", () => {
    const o = checkCI({ effect: "OR", point: 1.8, low: 1.1, high: 2.9, nullValue: 1, reportedPText: "= .01" });
    expect(o.consistent).toBe(true);
  });
  it("extracts effect + 95% CI + p from prose", () => {
    const ev = extractConfidenceIntervals("Risk was elevated, OR = 1.8, 95% CI [1.1, 2.9], p = .01.");
    expect(ev.length).toBe(1);
    expect(ev[0].interval!.effect).toBe("OR");
    expect(ev[0].interval!.nullValue).toBe(1);
    expect(ev[0].interval!.low).toBeCloseTo(1.1, 5);
  });
});

describe("Venn-Abers interval", () => {
  it("returns a valid ordered probability interval", async () => {
    const { vennAbersInterval } = await import("../calibration");
    const { makeAdjCalib } = await import("../demo/benchmark");
    const pts = makeAdjCalib().map((p) => ({ raw: p.raw, outcome: p.outcome }));
    const va = vennAbersInterval(pts, 0.7);
    expect(va.p0).toBeLessThanOrEqual(va.p1);
    expect(va.p0).toBeGreaterThanOrEqual(0);
    expect(va.p1).toBeLessThanOrEqual(1);
  });
});

describe("p-curve", () => {
  it("detects evidential value in a right-skewed curve", () => {
    expect(pcurve([0.001, 0.002, 0.003, 0.008]).verdict).toBe("evidential");
  });
  it("detects a hacking signature in a left-skewed curve", () => {
    expect(pcurve([0.048, 0.049, 0.047, 0.046]).verdict).toBe("hacking");
  });
});
