/**
 * stats.ts, numerical statistics primitives.
 *
 * These back the deterministic checkers (statcheck, power, p-curve). The whole
 * trust premise of Litmus is that *arithmetic happens in code, never in an LLM*,
 * so these are faithful implementations of standard algorithms:
 *
 *   - gammaln       Lanczos approximation
 *   - betai         regularized incomplete beta  (Numerical Recipes betacf)
 *   - gammap/gammaq regularized incomplete gamma  (series + continued fraction)
 *   - erf/erfc      via the incomplete gamma identity  erf(x) = P(1/2, x²)
 *   - normInv       Acklam's inverse-normal rational approximation
 *
 * From those we derive exact two-tailed p-values for t, F, χ², r and z, which is
 * all statcheck needs.
 */

const SQRT2 = Math.SQRT2;

/* ------------------------------------------------------------------ */
/* Log-gamma (Lanczos, g = 7)                                          */
/* ------------------------------------------------------------------ */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function gammaln(x: number): number {
  if (x < 0.5) {
    // reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  }
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7 + 0.5;
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/* ------------------------------------------------------------------ */
/* Regularized incomplete beta  I_x(a, b)                              */
/* ------------------------------------------------------------------ */

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt =
    gammaln(a + b) -
    gammaln(a) -
    gammaln(b) +
    a * Math.log(x) +
    b * Math.log(1 - x);
  const bt = Math.exp(lbt);
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/* ------------------------------------------------------------------ */
/* Regularized incomplete gamma  P(a, x), Q(a, x)                      */
/* ------------------------------------------------------------------ */

function gser(a: number, x: number): number {
  const ITMAX = 300;
  const EPS = 3e-14;
  const gln = gammaln(a);
  if (x <= 0) return 0;
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n <= ITMAX; n++) {
    ap++;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

function gcf(a: number, x: number): number {
  const ITMAX = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const gln = gammaln(a);
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Lower regularized incomplete gamma P(a, x). */
export function gammap(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x < a + 1) return gser(a, x);
  return 1 - gcf(a, x);
}

/** Upper regularized incomplete gamma Q(a, x) = 1 − P(a, x). */
export function gammaq(a: number, x: number): number {
  return 1 - gammap(a, x);
}

/* ------------------------------------------------------------------ */
/* Error function and normal distribution                              */
/* ------------------------------------------------------------------ */

export function erf(x: number): number {
  return x < 0 ? -gammap(0.5, x * x) : gammap(0.5, x * x);
}

export function erfc(x: number): number {
  return 1 - erf(x);
}

/** Standard normal CDF. */
export function normCdf(z: number): number {
  return 0.5 * erfc(-z / SQRT2);
}

/** Standard normal PDF. */
export function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Inverse standard normal CDF (Acklam's algorithm, |err| < 1.15e-9). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/* ------------------------------------------------------------------ */
/* CDFs                                                                */
/* ------------------------------------------------------------------ */

/** Student-t CDF, P(T ≤ t). */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const ib = 0.5 * betai(df / 2, 0.5, x);
  return t > 0 ? 1 - ib : ib;
}

/** F CDF, P(X ≤ f). */
export function fCdf(f: number, d1: number, d2: number): number {
  if (f <= 0) return 0;
  return betai(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2));
}

/** χ² CDF, P(X ≤ x). */
export function chi2Cdf(x: number, k: number): number {
  if (x <= 0) return 0;
  return gammap(k / 2, x / 2);
}

/* ------------------------------------------------------------------ */
/* Two-tailed / upper-tail p-values                                    */
/* ------------------------------------------------------------------ */

/** Two-tailed p-value for a t statistic. */
export function pFromT(t: number, df: number): number {
  if (df <= 0 || !isFinite(t)) return NaN;
  const x = df / (df + t * t);
  return betai(df / 2, 0.5, x);
}

/** Upper-tail p-value for an F statistic. */
export function pFromF(f: number, d1: number, d2: number): number {
  if (f < 0 || d1 <= 0 || d2 <= 0) return NaN;
  return betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
}

/** Upper-tail p-value for a χ² statistic. */
export function pFromChi2(x: number, df: number): number {
  if (x < 0 || df <= 0) return NaN;
  return gammaq(df / 2, x / 2);
}

/** Two-tailed p-value for a z statistic. */
export function pFromZ(z: number): number {
  return erfc(Math.abs(z) / SQRT2);
}

/** Two-tailed p-value for a Pearson correlation r with sample size n. */
export function pFromR(r: number, n: number): number {
  const df = n - 2;
  if (df <= 0 || Math.abs(r) >= 1) return NaN;
  const t = r * Math.sqrt(df / (1 - r * r));
  return pFromT(t, df);
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Round-half-away-from-zero to `d` decimals (matches reporting rounding). */
export function roundTo(x: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f;
}

/** Number of decimals in a numeric string, e.g. "0.030" → 3. */
export function decimalsOf(s: string): number {
  const m = /\.(\d+)/.exec(s.trim());
  return m ? m[1].length : 0;
}

/** Deterministic PRNG (mulberry32), reproducible SPRITE reconstructions. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
