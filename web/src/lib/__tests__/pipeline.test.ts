import { describe, it, expect } from "vitest";
import { DEMO_PAPERS, getDemoPaper, buildSourceText, methodsLocus } from "../demo/papers";
import { runIntrinsicChecks } from "../checks/intrinsic";
import { deterministicVerdict, classifyBand } from "../adjudicate";
import { fitFieldPlatt } from "../calibration";
import { makeAdjCalib } from "../demo/benchmark";
import { groundingGuard } from "../trust";
import type { Verdict } from "../types";

function calibrator() {
  return fitFieldPlatt(makeAdjCalib());
}

/** Deterministic core of the pipeline, offline (no network). */
function computeCore(id: string) {
  const paper = getDemoPaper(id)!;
  const checks = runIntrinsicChecks(paper.evidence, paper.design, { typicalD: paper.typicalD });
  const mLocus = methodsLocus(paper);
  const firstStat = paper.evidence.find((e) => e.stat)?.locus;
  for (const c of checks) {
    if (c.check === "design" && !c.locus) c.locus = mLocus;
    if (c.check === "pcurve" && !c.locus && firstStat) c.locus = firstStat;
  }
  const cal = calibrator();
  const source = buildSourceText(paper);
  const verdicts: Verdict[] = paper.claims.map((claim) => {
    const v = deterministicVerdict(claim, paper.evidence, checks, paper.curated, paper.meta.field);
    const p = cal.predict(v.rawScore, paper.meta.field);
    return { ...v, replicationLikelihood: p, band: classifyBand(p, v.abstain) };
  });
  let total = 0;
  let kept = 0;
  for (const v of verdicts) {
    const g = groundingGuard(v.topReasons, source);
    total += v.topReasons.length;
    kept += g.kept.length;
  }
  const central = verdicts.filter(
    (v) => paper.claims.find((c) => c.id === v.claimId)?.isCentral && !v.abstain,
  );
  let overall =
    central.length > 0
      ? central.reduce((a, v) => a + v.replicationLikelihood, 0) / central.length
      : 0.5;
  const integrityFail = checks.some(
    (c) => ["grim", "grimmer", "sprite"].includes(c.check) && c.status === "fail",
  );
  if (integrityFail) overall = Math.min(overall, 0.1);
  return { paper, checks, verdicts, overall, groundingRate: total ? kept / total : 1 };
}

describe("demo paper: fragile cancer study", () => {
  const { checks, overall } = computeCore("stk33-synthetic-lethal");
  it("statcheck flags the e1 decision inconsistency", () => {
    const sc = checks.find((c) => c.id === "statcheck:e1")!;
    expect(sc.status).toBe("fail");
  });
  it("e2 is correctly reported (passes statcheck)", () => {
    const sc = checks.find((c) => c.id === "statcheck:e2")!;
    expect(sc.status).toBe("pass");
  });
  it("power flags the underpowered n=4 xenograft", () => {
    const pw = checks.find((c) => c.id === "power:e3")!;
    expect(pw.status).toBe("warn");
  });
  it("scores as fragile / unsupported", () => {
    expect(overall).toBeLessThan(0.45);
  });
});

describe("demo paper: impossible psychology data", () => {
  const { checks, overall } = computeCore("ego-depletion-ethics");
  it("GRIM flags the impossible mean (5.19, n=28)", () => {
    const g = checks.find((c) => c.id === "grim:d1")!;
    expect(g.status).toBe("fail");
  });
  it("SPRITE flags at least one impossible SD", () => {
    const spriteFails = checks.filter((c) => c.check === "sprite" && c.status === "fail");
    expect(spriteFails.length).toBeGreaterThanOrEqual(1);
  });
  it("scores near the floor (integrity cap on impossible data)", () => {
    expect(overall).toBeLessThan(0.12);
  });
});

describe("demo paper: solid RCT", () => {
  const { checks, overall } = computeCore("pcsk9-ldl-rct");
  it("has no failing checks", () => {
    expect(checks.filter((c) => c.status === "fail").length).toBe(0);
  });
  it("p-curve shows evidential value", () => {
    const pc = checks.find((c) => c.check === "pcurve")!;
    expect(pc.status).toBe("pass");
  });
  it("scores as robust", () => {
    expect(overall).toBeGreaterThan(0.6);
  });
});

describe("demo paper: mixed microbiome case", () => {
  const { verdicts } = computeCore("microbiome-immunotherapy");
  it("abstains on the thin single-taxon claim (c2)", () => {
    expect(verdicts.find((v) => v.claimId === "c2")!.abstain).toBe(true);
  });
  it("does not abstain on the corroborated diversity claim (c1)", () => {
    expect(verdicts.find((v) => v.claimId === "c1")!.abstain).toBe(false);
  });
  it("c1 carries high uncertainty (conflicting cohorts)", () => {
    expect(verdicts.find((v) => v.claimId === "c1")!.uncertainty).toBeGreaterThan(0.15);
  });
});

describe("grounding", () => {
  it("every surfaced reason resolves to a real source span (100%)", () => {
    for (const p of DEMO_PAPERS) {
      const { groundingRate } = computeCore(p.meta.id);
      expect(groundingRate).toBe(1);
    }
  });
});
