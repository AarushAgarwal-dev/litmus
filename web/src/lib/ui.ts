/** Shared presentation mappings, bands, statuses, formatting. */

import type { CheckStatus, Severity, Verdict } from "./types";

export function pct(x: number, d = 0): string {
  return `${(x * 100).toFixed(d)}%`;
}

export function pRound(x: number): string {
  if (x < 0.001) return "<.001";
  return x.toFixed(3).replace(/^0/, "");
}

export type Band = Verdict["band"];

export const BAND: Record<
  Band,
  { label: string; pill: string; color: string; wash: string; blurb: string }
> = {
  robust: {
    label: "Robust",
    pill: "pill-sage",
    color: "var(--color-sage)",
    wash: "var(--color-sage-wash)",
    blurb: "Well-supported. Safe to build on, with normal diligence.",
  },
  mixed: {
    label: "Mixed",
    pill: "pill-amber",
    color: "var(--color-amber)",
    wash: "var(--color-amber-wash)",
    blurb: "Real signal, real caveats. Verify the load-bearing pieces first.",
  },
  fragile: {
    label: "Fragile",
    pill: "pill-brick",
    color: "var(--color-brick)",
    wash: "var(--color-brick-wash)",
    blurb: "Standing on sand. Independent confirmation needed before committing.",
  },
  unsupported: {
    label: "Unsupported",
    pill: "pill-brick",
    color: "var(--color-brick)",
    wash: "var(--color-brick-wash)",
    blurb: "The evidence does not support the claim as stated.",
  },
  abstained: {
    label: "Abstained",
    pill: "pill-slate",
    color: "var(--color-slate)",
    wash: "var(--color-slate-wash)",
    blurb: "Insufficient basis to score. An honest 'we don't know' beats a guess.",
  },
};

export const STATUS: Record<
  CheckStatus,
  { label: string; pill: string; color: string }
> = {
  pass: { label: "Pass", pill: "pill-sage", color: "var(--color-sage)" },
  warn: { label: "Warn", pill: "pill-amber", color: "var(--color-amber)" },
  fail: { label: "Fail", pill: "pill-brick", color: "var(--color-brick)" },
  na: { label: "N/A", pill: "pill-neutral", color: "var(--color-faint)" },
};

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function severityLabel(s: Severity): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A "meta" claim is a statement ABOUT the paper (what it asserted, its status)
 * rather than about the world. Its likelihood measures "does the paper say
 * this," not "is this reproducible," so a high score must not read as a green
 * light. We detect the phrasing and let the UI mark it distinctly.
 */
export function isMetaClaim(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/\b(has been|had been|was|were|is|been)\s+retracted\b/.test(t)) return true;
  if (/^(the|this|that|these|its|their)\s+(original\s+)?(paper|study|article|authors?|work|manuscript|report|findings?|results?)\b/.test(t))
    return true;
  if (/\bthe (original )?(paper|study|authors?|article|work)\b[^.]*\b(proposed|claimed|reported|described|asserted|suggested|found|concluded|argued|hypothesi[sz]ed)\b/.test(t))
    return true;
  return false;
}

export const CHECK_META: Record<string, { name: string; blurb: string }> = {
  statcheck: { name: "statcheck", blurb: "Recomputes p-values from the reported statistics." },
  grim: { name: "GRIM", blurb: "Tests whether a reported mean is arithmetically possible." },
  grimmer: { name: "GRIMMER", blurb: "Tests whether a mean and SD can coexist for integer data." },
  sprite: { name: "SPRITE", blurb: "Reconstructs whether any sample fits the reported stats." },
  power: { name: "Power", blurb: "The smallest effect the design could actually detect." },
  pcurve: { name: "p-curve", blurb: "Whether the significant results carry evidential value." },
  design: { name: "Design", blurb: "Randomization, blinding, controls, correction, transparency." },
  reference: { name: "References", blurb: "Whether citations resolve and support their sentence." },
  image: { name: "Image", blurb: "Duplication and manipulation of figures." },
  extrinsic: { name: "Literature", blurb: "What the rest of the field says about this claim." },
};
