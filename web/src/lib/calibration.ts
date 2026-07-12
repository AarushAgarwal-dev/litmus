/**
 * calibration.ts, turn a raw fused score into a real probability.
 *
 * A raw model score is not a probability. We fit isotonic regression (via
 * pool-adjacent-violators) on labeled replication outcomes so that "0.7" means
 * ~70% of such papers replicate. Replication base-rates differ by field, so we
 * fit per field and fall back to a global model when a field is thin.
 *
 * Also here: the evaluation metrics the benchmark page reports (ROC-AUC, PR-AUC,
 * Brier, ECE, reliability bins), computed, not asserted.
 */

export interface LabeledPoint {
  field: string;
  raw: number; // fused raw score 0..1
  outcome: 0 | 1; // 1 = replicated / held up, 0 = failed / retracted
}

export interface IsotonicModel {
  x: number[];
  y: number[];
}

/** Pool-adjacent-violators isotonic regression (non-decreasing fit). */
export function isotonicFit(points: { raw: number; outcome: number }[]): IsotonicModel {
  const sorted = [...points].sort((a, b) => a.raw - b.raw);
  const xs = sorted.map((p) => p.raw);
  const ys = sorted.map((p) => p.outcome);
  const n = ys.length;
  if (n === 0) return { x: [0, 1], y: [0, 1] };

  // Active-set PAV over blocks {sum, weight, mean}.
  const blockMean: number[] = [];
  const blockWeight: number[] = [];
  const blockEnd: number[] = []; // index of last x in the block
  for (let i = 0; i < n; i++) {
    blockMean.push(ys[i]);
    blockWeight.push(1);
    blockEnd.push(i);
    while (
      blockMean.length >= 2 &&
      blockMean[blockMean.length - 2] > blockMean[blockMean.length - 1]
    ) {
      const m2 = blockMean.pop()!;
      const w2 = blockWeight.pop()!;
      const e2 = blockEnd.pop()!;
      const m1 = blockMean.pop()!;
      const w1 = blockWeight.pop()!;
      blockEnd.pop();
      const w = w1 + w2;
      blockMean.push((m1 * w1 + m2 * w2) / w);
      blockWeight.push(w);
      blockEnd.push(e2);
    }
  }

  // Expand blocks to breakpoints for interpolation.
  const bx: number[] = [];
  const by: number[] = [];
  let start = 0;
  for (let b = 0; b < blockMean.length; b++) {
    const end = blockEnd[b];
    bx.push(xs[start]);
    by.push(blockMean[b]);
    bx.push(xs[end]);
    by.push(blockMean[b]);
    start = end + 1;
  }
  return { x: bx, y: by };
}

/** Predict a calibrated probability by clamped linear interpolation. */
export function isotonicPredict(model: IsotonicModel, raw: number): number {
  const { x, y } = model;
  if (raw <= x[0]) return y[0];
  if (raw >= x[x.length - 1]) return y[y.length - 1];
  for (let i = 1; i < x.length; i++) {
    if (raw <= x[i]) {
      const x0 = x[i - 1];
      const x1 = x[i];
      if (x1 === x0) return y[i];
      const t = (raw - x0) / (x1 - x0);
      return y[i - 1] + t * (y[i] - y[i - 1]);
    }
  }
  return y[y.length - 1];
}

export interface FieldCalibrator {
  global: IsotonicModel;
  byField: Record<string, IsotonicModel>;
  predict: (raw: number, field?: string) => number;
}

const MIN_FIELD_POINTS = 20;

export function fitCalibrator(data: LabeledPoint[]): FieldCalibrator {
  const global = isotonicFit(data);
  const groups: Record<string, LabeledPoint[]> = {};
  for (const p of data) (groups[p.field] ||= []).push(p);
  const byField: Record<string, IsotonicModel> = {};
  for (const [field, pts] of Object.entries(groups)) {
    if (pts.length >= MIN_FIELD_POINTS) byField[field] = isotonicFit(pts);
  }
  return {
    global,
    byField,
    predict(raw: number, field?: string) {
      const m = (field && byField[field]) || global;
      // Clamp away from a degenerate 0/1: the isotonic tails on a finite sample
      // are pure-0 / pure-1 bins, which would over-claim certainty.
      return Math.min(0.97, Math.max(0.03, isotonicPredict(m, raw)));
    },
  };
}

/* ---------------- Venn-Abers (distribution-free probability interval) ---------------- */

/**
 * Venn-Abers predictor: refit isotonic with the test point forced to y=0 and to
 * y=1, giving a validity-guaranteed probability interval [p0, p1] for a binary
 * outcome. Unlike plain split-conformal (whose |p - y| residuals collapse toward
 * 0.5 for 0/1 labels), this yields a genuinely useful interval that widens where
 * the calibration data is sparse and tightens where it's dense.
 */
export function vennAbersInterval(
  points: { raw: number; outcome: number }[],
  score: number,
): { p0: number; p1: number; width: number } {
  if (points.length < 8) return { p0: 0.15, p1: 0.85, width: 0.7 };
  const g0 = isotonicFit([...points, { raw: score, outcome: 0 }]);
  const g1 = isotonicFit([...points, { raw: score, outcome: 1 }]);
  const p0 = Math.min(1, Math.max(0, isotonicPredict(g0, score)));
  const p1 = Math.min(1, Math.max(0, isotonicPredict(g1, score)));
  const lo = Math.min(p0, p1);
  const hi = Math.max(p0, p1);
  return { p0: lo, p1: hi, width: hi - lo };
}

/* ---------------- Platt (logistic) scaling ---------------- */

function clamp01s(x: number): number {
  return Math.min(0.999, Math.max(0.001, x));
}
function logit(p: number): number {
  const q = clamp01s(p);
  return Math.log(q / (1 - q));
}
function sig(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface PlattModel {
  a: number;
  b: number;
}

/**
 * Platt scaling: P(replicate) = σ(a·logit(raw) + b), fit by logistic regression.
 * Smooth and monotone, no step artifacts, which suits a score that is already
 * probability-anchored and only needs a gentle correction.
 */
export function fitPlatt(points: { raw: number; outcome: number }[]): PlattModel {
  if (points.length < 8) return { a: 1, b: 0 };
  const xs = points.map((p) => logit(p.raw));
  const ys = points.map((p) => p.outcome);
  const n = xs.length;
  let a = 1;
  let b = 0;
  const lr = 0.15;
  for (let it = 0; it < 1500; it++) {
    let ga = 0;
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const e = sig(a * xs[i] + b) - ys[i];
      ga += e * xs[i];
      gb += e;
    }
    a -= (lr * ga) / n;
    b -= (lr * gb) / n;
  }
  return { a, b };
}

export function plattPredict(m: PlattModel, raw: number): number {
  return Math.min(0.97, Math.max(0.03, sig(m.a * logit(raw) + m.b)));
}

export interface FieldPlatt {
  global: PlattModel;
  byField: Record<string, PlattModel>;
  predict: (raw: number, field?: string) => number;
}

export function fitFieldPlatt(data: LabeledPoint[]): FieldPlatt {
  const global = fitPlatt(data);
  const groups: Record<string, LabeledPoint[]> = {};
  for (const p of data) (groups[p.field] ||= []).push(p);
  const byField: Record<string, PlattModel> = {};
  for (const [field, pts] of Object.entries(groups)) {
    if (pts.length >= 30) byField[field] = fitPlatt(pts);
  }
  return {
    global,
    byField,
    predict: (raw, field) => plattPredict((field && byField[field]) || global, raw),
  };
}

/* ---------------- metrics ---------------- */

/** ROC-AUC via the rank-sum (Mann–Whitney) identity. */
export function rocAuc(labels: number[], scores: number[]): number {
  const pos = labels.reduce((a, b) => a + b, 0);
  const neg = labels.length - pos;
  if (pos === 0 || neg === 0) return NaN;
  const idx = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  // average ranks (handle ties)
  let rankSumPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j < idx.length && idx[j].s === idx[i].s) j++;
    const avgRank = (i + 1 + j) / 2; // ranks are 1-based: (i+1 .. j)
    for (let k = i; k < j; k++) if (idx[k].y === 1) rankSumPos += avgRank;
    i = j;
  }
  return (rankSumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** PR-AUC via the trapezoid over the precision-recall curve. */
export function prAuc(labels: number[], scores: number[]): number {
  const order = scores
    .map((s, i) => ({ s, y: labels[i] }))
    .sort((a, b) => b.s - a.s);
  const totalPos = labels.reduce((a, b) => a + b, 0);
  if (totalPos === 0) return NaN;
  let tp = 0;
  let fp = 0;
  let prevRecall = 0;
  let prevPrec = 1;
  let area = 0;
  // Advance one distinct-score threshold at a time so tied scores don't let
  // the intra-tie ordering inflate the area.
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j < order.length && order[j].s === order[i].s) {
      if (order[j].y === 1) tp++;
      else fp++;
      j++;
    }
    const recall = tp / totalPos;
    const prec = tp / (tp + fp);
    area += ((recall - prevRecall) * (prec + prevPrec)) / 2;
    prevRecall = recall;
    prevPrec = prec;
    i = j;
  }
  return area;
}

/** Brier score (mean squared error of probabilistic predictions). */
export function brier(labels: number[], probs: number[]): number {
  if (labels.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < labels.length; i++) s += (probs[i] - labels[i]) ** 2;
  return s / labels.length;
}

export interface ReliabilityBin {
  lo: number;
  hi: number;
  meanPred: number;
  fracPos: number;
  count: number;
}

/** Reliability diagram bins + Expected Calibration Error. */
export function reliability(
  labels: number[],
  probs: number[],
  nBins = 10): { bins: ReliabilityBin[]; ece: number } {
  const bins: ReliabilityBin[] = [];
  for (let b = 0; b < nBins; b++) {
    const lo = b / nBins;
    const hi = (b + 1) / nBins;
    const idx: number[] = [];
    for (let i = 0; i < probs.length; i++) {
      const p = probs[i];
      if ((p >= lo && p < hi) || (b === nBins - 1 && p === 1)) idx.push(i);
    }
    const count = idx.length;
    const meanPred = count ? idx.reduce((a, i) => a + probs[i], 0) / count : (lo + hi) / 2;
    const fracPos = count ? idx.reduce((a, i) => a + labels[i], 0) / count : 0;
    bins.push({ lo, hi, meanPred, fracPos, count });
  }
  const total = labels.length;
  const ece = bins.reduce(
    (a, bin) => a + (bin.count / total) * Math.abs(bin.meanPred - bin.fracPos),
    0);
  return { bins, ece };
}
