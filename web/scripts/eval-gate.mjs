/**
 * scripts/eval-gate.mjs — regression gate for the evaluation harness.
 *
 * Runs the frozen benchmark on every change and fails (non-zero exit) if
 * discrimination or calibration regress past the thresholds below. Wire this
 * into CI so a well-meaning prompt/model/check tweak cannot silently erode
 * trust: a merge that drops AUC or worsens calibration is blocked.
 *
 * Usage:  node scripts/eval-gate.mjs   (via `npm run eval:gate`)
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeBenchmark } from "../src/lib/demo/benchmark.ts";

// Thresholds sit just below the current committed numbers, so genuine noise
// passes but a real regression is caught. Tighten as the engine improves.
const GATE = {
  aucMin: 0.8,
  eceCalMax: 0.11,
  brierCalMax: 0.2,
  realAucMin: 0.7, // applied only if a real-results.json exists
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fails = [];

const r = computeBenchmark();
console.log(
  `Synthetic harness  AUC=${r.auc.toFixed(3)}  PR-AUC=${r.prauc.toFixed(3)}  ` +
    `ECE raw=${r.eceRaw.toFixed(3)} -> cal=${r.eceCal.toFixed(3)}  Brier cal=${r.brierCal.toFixed(3)}`,
);
if (r.auc < GATE.aucMin) fails.push(`AUC ${r.auc.toFixed(3)} < ${GATE.aucMin}`);
if (r.eceCal > GATE.eceCalMax) fails.push(`calibrated ECE ${r.eceCal.toFixed(3)} > ${GATE.eceCalMax}`);
if (r.eceCal > r.eceRaw)
  fails.push(`calibration made ECE worse (${r.eceRaw.toFixed(3)} -> ${r.eceCal.toFixed(3)})`);
if (r.brierCal > GATE.brierCalMax) fails.push(`calibrated Brier ${r.brierCal.toFixed(3)} > ${GATE.brierCalMax}`);

// If a real labeled slice has been run, gate on it too.
const realPath = path.join(__dirname, "..", "src", "lib", "eval", "real-results.json");
if (existsSync(realPath)) {
  try {
    const real = JSON.parse(readFileSync(realPath, "utf8"));
    const auc = real?.metrics?.auc;
    if (typeof auc === "number") {
      console.log(`Real labeled slice AUC=${auc.toFixed(3)} (n=${real.metrics.n})`);
      if (auc < GATE.realAucMin) fails.push(`real-slice AUC ${auc.toFixed(3)} < ${GATE.realAucMin}`);
    }
  } catch {
    console.warn("real-results.json present but unreadable; skipping real-slice gate.");
  }
}

if (fails.length) {
  console.error("\nEVAL GATE FAILED:\n - " + fails.join("\n - "));
  process.exit(1);
}
console.log("\nEVAL GATE PASSED");
