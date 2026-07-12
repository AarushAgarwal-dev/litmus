/**
 * intrinsic.ts, run every deterministic checker over a claim graph and collect
 * the results. No network, no model, no randomness beyond seeded SPRITE.
 */

import type { AuditReport, CheckResult, Evidence, DesignAttributes } from "../types";
import { runStatcheck, recomputeP } from "./statcheck";
import { runGrim, runGrimmer } from "./grim";
import { runSprite } from "./sprite";
import { runPower } from "./power";
import { runPcurve } from "./pcurve";
import { runDesignChecks } from "./design";
import { runCIConsistency } from "./interval";

export interface IntrinsicOptions {
  typicalD?: number; // reference effect size for the power check
}

export function runIntrinsicChecks(
  evidence: Evidence[],
  design: DesignAttributes,
  opts: IntrinsicOptions = {}): CheckResult[] {
  const results: CheckResult[] = [];
  const pValues: number[] = [];

  for (const ev of evidence) {
    if (ev.stat) {
      results.push(runStatcheck(ev.stat, ev));
      const p = recomputeP(ev.stat);
      if (isFinite(p)) pValues.push(p);
      const power = runPower(ev.stat, ev, opts.typicalD ?? 0.5);
      if (power) results.push(power);
    }
    if (ev.descriptive) {
      results.push(runGrim(ev.descriptive, ev));
      const grimmer = runGrimmer(ev.descriptive, ev);
      if (grimmer) results.push(grimmer);
      const sprite = runSprite(ev.descriptive, ev);
      if (sprite) results.push(sprite);
    }
    if (ev.interval) {
      const ci = runCIConsistency(ev);
      if (ci) results.push(ci);
    }
  }

  const pc = runPcurve(pValues);
  if (pc) results.push(pc);

  results.push(...runDesignChecks(design));

  return results;
}

/** Compact roll-up of check outcomes for scoring / display. */
export function summarizeChecks(checks: CheckResult[]) {
  const fails = checks.filter((c) => c.status === "fail");
  const warns = checks.filter((c) => c.status === "warn");
  const passes = checks.filter((c) => c.status === "pass");
  const critical = fails.filter((c) => c.severity === "critical");
  const high = [...fails, ...warns].filter((c) => c.severity === "high");
  return {
    fails: fails.length,
    warns: warns.length,
    passes: passes.length,
    critical: critical.length,
    high: high.length,
    total: checks.filter((c) => c.status !== "na").length,
  };
}

export type ChecksForReport = Pick<AuditReport, "checks">;
