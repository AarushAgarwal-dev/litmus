/**
 * scripts/run-real-eval.mjs — run the REAL labeled slice through the live pipeline.
 *
 * Hits POST /api/audit for each case in eval/real-cases.ts (the identical
 * production path), collects the calibrated replication likelihood, and computes
 * real ROC-AUC / Brier / ECE / precision-recall against the known outcomes.
 * Writes src/lib/eval/real-results.json, which the benchmark page renders.
 *
 * Usage:  node scripts/run-real-eval.mjs [baseUrl] [concurrency]
 *   (run with tsx-capable node; invoked via `npm run eval:real`)
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { REAL_CASES } from "../src/lib/eval/real-cases.ts";
import { rocAuc, brier, reliability } from "../src/lib/calibration.ts";

const BASE = process.argv[2] || "http://localhost:3000";
const CONCURRENCY = Number(process.argv[3] || 4);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "src", "lib", "eval", "real-results.json");

async function auditOnce(c) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 300_000);
  try {
    const res = await fetch(`${BASE}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doi: c.doi }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) return { ...c, error: `HTTP ${res.status}` };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let report = null;
    let errored = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "done" && ev.report) report = ev.report;
        if (ev.type === "error") errored = ev.message;
      }
    }
    if (!report) return { ...c, error: errored || "no report" };
    const o = report.overall;
    return {
      doi: c.doi,
      label: c.label,
      cls: c.cls,
      outcome: c.outcome,
      hard: !!c.hard,
      likelihood: o.replicationLikelihood,
      band: o.band,
      retracted: !!o.retracted,
      auditId: report.meta.auditId,
    };
  } catch (e) {
    return { ...c, error: e?.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

// Retry once on transient failure (rate-limited source, dropped socket).
async function auditOne(c) {
  let r = await auditOnce(c);
  if (r.error) {
    await new Promise((res) => setTimeout(res, 5000));
    r = await auditOnce(c);
  }
  return r;
}

async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let i = 0;
  async function next() {
    const idx = i++;
    if (idx >= items.length) return;
    out[idx] = await worker(items[idx], idx);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return out;
}

function precisionRecall(rows, threshold = 0.5) {
  // Positive class = "robust/will replicate" (outcome 1, predicted likelihood ≥ threshold).
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    const pred = r.likelihood >= threshold ? 1 : 0;
    if (pred === 1 && r.outcome === 1) tp++;
    else if (pred === 1 && r.outcome === 0) fp++;
    else if (pred === 0 && r.outcome === 0) tn++;
    else fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision != null && recall != null && precision + recall ? (2 * precision * recall) / (precision + recall) : null;
  const accuracy = rows.length ? (tp + tn) / rows.length : null;
  return { threshold, tp, fp, tn, fn, precision, recall, f1, accuracy };
}

// Nonparametric bootstrap 95% CI for a metric over (y, p) pairs.
function bootstrap(y, p, fn, { needsBothClasses = false, B = 2000 } = {}) {
  const n = y.length;
  const vals = [];
  let guard = 0;
  while (vals.length < B && guard < B * 20) {
    guard++;
    const yy = [];
    const pp = [];
    for (let i = 0; i < n; i++) {
      const j = Math.floor(Math.random() * n);
      yy.push(y[j]);
      pp.push(p[j]);
    }
    if (needsBothClasses && (yy.every((v) => v === 1) || yy.every((v) => v === 0))) continue;
    try {
      const v = fn(yy, pp);
      if (Number.isFinite(v)) vals.push(v);
    } catch {
      /* skip degenerate resample */
    }
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const at = (q) => +vals[Math.min(vals.length - 1, Math.floor(q * vals.length))].toFixed(3);
  return { lo: at(0.025), hi: at(0.975) };
}

function classMeans(rows) {
  const by = {};
  for (const cls of ["retracted", "failed-replication", "robust"]) {
    const rs = rows.filter((r) => r.cls === cls);
    by[cls] = rs.length
      ? { n: rs.length, meanLikelihood: rs.reduce((a, r) => a + r.likelihood, 0) / rs.length }
      : { n: 0, meanLikelihood: null };
  }
  return by;
}

async function main() {
  console.log(`Running ${REAL_CASES.length} real cases against ${BASE} (concurrency ${CONCURRENCY})...`);
  const started = new Date().toISOString();
  const results = await runPool(REAL_CASES, async (c, i) => {
    const r = await auditOne(c);
    console.log(`  [${i + 1}/${REAL_CASES.length}] ${c.cls.padEnd(18)} ${c.label.slice(0, 40).padEnd(40)} -> ${r.error ? "ERROR: " + r.error : Math.round(r.likelihood * 100) + "% " + r.band}`);
    return r;
  }, CONCURRENCY);

  const scored = results.filter((r) => !r.error && Number.isFinite(r.likelihood));
  const failed = results.filter((r) => r.error);
  const y = scored.map((r) => r.outcome);
  const p = scored.map((r) => r.likelihood);

  const rel = reliability(y, p, 5);
  const metrics = {
    n: scored.length,
    nUnresolved: failed.length,
    positives: y.filter((v) => v === 1).length,
    negatives: y.filter((v) => v === 0).length,
    auc: scored.length >= 2 ? rocAuc(y, p) : null,
    brier: scored.length ? brier(y, p) : null,
    ece: rel.ece,
    reliability: rel.bins,
    prAt50: precisionRecall(scored, 0.5),
    byClass: classMeans(scored),
    ci: {
      auc: bootstrap(y, p, (a, b) => rocAuc(a, b), { needsBothClasses: true }),
      brier: bootstrap(y, p, (a, b) => brier(a, b)),
      ece: bootstrap(y, p, (a, b) => reliability(a, b, 5).ece),
    },
  };

  // Run-to-run stability: re-audit a fixed subset a second time and compare bands.
  const firstBand = Object.fromEntries(scored.map((r) => [r.doi, { band: r.band, likelihood: r.likelihood }]));
  const stabilityDois = [
    "10.1016/S0140-6736(97)11096-0", // Wakefield (retracted)
    "10.1037/0022-3514.74.5.1252", // ego depletion (failed)
    "10.1126/science.1225829", // CRISPR (robust)
  ];
  const stabilityRuns = [];
  let agree = 0;
  let checked = 0;
  for (const doi of stabilityDois) {
    const c = REAL_CASES.find((x) => x.doi === doi);
    const first = firstBand[doi];
    if (!c || !first) continue;
    const r2 = await auditOne(c);
    if (r2.error) continue;
    checked++;
    const same = first.band === r2.band;
    if (same) agree++;
    stabilityRuns.push({
      doi,
      band1: first.band,
      band2: r2.band,
      likelihood1: first.likelihood,
      likelihood2: r2.likelihood,
      sameBand: same,
    });
    console.log(`  stability ${doi}: ${first.band} -> ${r2.band} (${same ? "same" : "CHANGED"})`);
  }
  metrics.stability = { checked, agreement: checked ? agree / checked : null, runs: stabilityRuns };

  const payload = {
    generatedAt: started,
    finishedAt: new Date().toISOString(),
    baseUrl: BASE,
    engineNote: "Live production pipeline (Claude adjudication + deterministic checks + multi-source retrieval + retraction detection).",
    config: {
      maxClaims: process.env.LITMUS_MAX_CLAIMS || "default",
      tokAdjudicate: process.env.LITMUS_TOK_ADJUDICATE || "default",
      ensemble: process.env.LITMUS_ENSEMBLE_MODELS || "single",
    },
    metrics,
    cases: results.map((r) => ({
      doi: r.doi,
      label: r.label,
      cls: r.cls,
      outcome: r.outcome,
      hard: !!r.hard,
      likelihood: r.error ? null : r.likelihood,
      band: r.error ? null : r.band,
      retracted: r.error ? null : r.retracted,
      auditId: r.error ? null : r.auditId,
      error: r.error ?? null,
    })),
    unresolved: failed.map((r) => ({ doi: r.doi, label: r.label, error: r.error })),
  };

  writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\nWrote ${OUT}`);
  console.log(`Scored ${metrics.n}/${REAL_CASES.length} (${metrics.positives} robust, ${metrics.negatives} not).`);
  console.log(`AUC=${metrics.auc?.toFixed(3)} Brier=${metrics.brier?.toFixed(3)} ECE=${metrics.ece?.toFixed(3)}`);
  console.log(`Precision=${metrics.prAt50.precision?.toFixed(2)} Recall=${metrics.prAt50.recall?.toFixed(2)} Acc=${metrics.prAt50.accuracy?.toFixed(2)}`);
  console.log(`Class means: ` + Object.entries(metrics.byClass).map(([k, v]) => `${k}=${v.meanLikelihood == null ? "-" : Math.round(v.meanLikelihood * 100) + "%"}`).join("  "));
}

main().catch((e) => { console.error(e); process.exit(1); });
