/**
 * extract/ci.ts, pull "effect + 95% CI + p" triples out of prose.
 *
 * Feeds the CI-vs-p consistency check. Conservative by design: it only fires
 * when an effect label, a bracketed interval, and (nearby) a p-value are all
 * present, e.g. "OR = 1.8, 95% CI [0.9, 3.4], p = .09".
 */

import type { Evidence, IntervalResult } from "../types";
import { sentenceAround } from "./stats";

const RE =
  /\b(OR|HR|RR|d|β|b|r|Δ|MD)\s*=\s*(-?\d+(?:\.\d+)?)[^.]{0,70}?95\s*%?\s*(?:CI|confidence interval)s?[:\s]*[[(]?\s*(-?\d+(?:\.\d+)?)\s*(?:,|to|–|-|;)\s*(-?\d+(?:\.\d+)?)\s*[\])]?/gi;

const RATIO = /^(OR|HR|RR)$/i;

export function extractConfidenceIntervals(text: string, section = "Body"): Evidence[] {
  const out: Evidence[] = [];
  for (const m of text.matchAll(RE)) {
    const point = parseFloat(m[2]);
    const low = parseFloat(m[3]);
    const high = parseFloat(m[4]);
    if (![point, low, high].every(Number.isFinite)) continue;
    const end = m.index! + m[0].length;
    const win = text.slice(Math.max(0, m.index! - 30), end + 80);
    const pm = /\bp\s*(<=|>=|<|>|=)\s*(0?\.\d+|\.\d+|\d\.\d+(?:e-?\d+)?)/i.exec(win);
    const reportedPText = pm ? `${pm[1]} ${pm[2]}` : undefined;
    const iv: IntervalResult = {
      effect: m[1],
      point,
      low,
      high,
      nullValue: RATIO.test(m[1]) ? 1 : 0,
      reportedPText,
    };
    const { quote, start } = sentenceAround(text, m.index!);
    out.push({
      id: `iv${out.length + 1}`,
      kind: "assertion",
      text: m[0],
      interval: iv,
      locus: { section, page: 0, quote, charStart: start, charEnd: start + m[0].length },
    });
  }
  return out;
}
