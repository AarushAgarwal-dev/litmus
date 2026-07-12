/**
 * extract/stats.ts, pull reported statistics out of real paper text.
 *
 * This is the same idea as statcheck's own scraper: scan prose for APA-style
 * test statistics (t, F, χ², r, z) each paired with a reported p-value, plus
 * mean±SD descriptives. It runs on ANY paper text, with no model and no key, * so the statistical forensics are real even before Claude touches anything.
 *
 * Every extracted item keeps its character offsets and enclosing sentence, so
 * the grounding guard can verify it and the UI can link back to the source.
 */

import type { Evidence, StatResult, Descriptive, Locus } from "../types";

/** The sentence containing character `index`. */
export function sentenceAround(text: string, index: number): { quote: string; start: number } {
  let start = index;
  while (start > 0 && !/[.!?]\s/.test(text.slice(start - 2, start))) start--;
  // walk back to the char after the previous sentence terminator
  const before = text.slice(0, index);
  const bm = /[.!?]\s+[^.!?]*$/.exec(before);
  start = bm ? bm.index + bm[0].search(/\S/) + 1 : Math.max(0, index - 140);
  const after = text.slice(index);
  const am = /[.!?](\s|$)/.exec(after);
  const end = am ? index + am.index + 1 : Math.min(text.length, index + 160);
  return { quote: text.slice(start, end).replace(/\s+/g, " ").trim(), start };
}

/** Parse a reported p-value that follows a statistic, within a short window. */
function findP(win: string): { comparator: "=" | "<" | ">"; text: string } | null {
  const m = /\bp\s*(=|<|>|≤|≥)\s*(0?\.\d+|\.\d+|\d\.\d+(?:e-?\d+)?)/i.exec(win);
  if (!m) return null;
  const cmp = m[1] === "≤" ? "<" : m[1] === "≥" ? ">" : (m[1] as "=" | "<" | ">");
  return { comparator: cmp, text: m[2] };
}

const WINDOW = 80;

interface Extracted {
  evidence: Evidence[];
  pValues: number[];
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

export function extractStatistics(text: string, section = "Body"): Extracted {
  counter = 0;
  const evidence: Evidence[] = [];
  const seen = new Set<string>();

  const push = (index: number, stat: StatResult, raw: string) => {
    const key = `${stat.test}:${stat.value}:${stat.df1 ?? ""}:${stat.df2 ?? ""}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    const { quote, start } = sentenceAround(text, index);
    const locus: Locus = {
      section,
      page: 0,
      quote: quote || raw,
      charStart: start,
      charEnd: start + raw.length,
    };
    evidence.push({ id: nextId("x"), kind: "stat", text: raw.trim(), stat, locus });
  };

  // t(df) = v, p ...
  for (const m of text.matchAll(
    /\bt\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*(=|<|>)\s*(-?\d*\.?\d+)/g)) {
    const p = findP(text.slice(m.index! + m[0].length, m.index! + m[0].length + WINDOW));
    push(m.index!, {
      test: "t",
      value: Math.abs(parseFloat(m[3])),
      df1: parseFloat(m[1]),
      comparator: m[2] as StatResult["comparator"],
      reportedPText: p?.text,
    }, m[0]);
  }

  // F(df1, df2) = v, p ...
  for (const m of text.matchAll(
    /\bF\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*(=|<|>)\s*(\d*\.?\d+)/g)) {
    const p = findP(text.slice(m.index! + m[0].length, m.index! + m[0].length + WINDOW));
    push(m.index!, {
      test: "F",
      value: parseFloat(m[4]),
      df1: parseFloat(m[1]),
      df2: parseFloat(m[2]),
      reportedPText: p?.text,
    }, m[0]);
  }

  // χ²(df[, N=k]) = v, p ...
  for (const m of text.matchAll(
    /(?:χ²|χ2|chi-?squared?|Χ2|X²)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:,\s*N\s*=\s*\d+)?\s*\)\s*(=|<|>)\s*(\d*\.?\d+)/gi)) {
    const p = findP(text.slice(m.index! + m[0].length, m.index! + m[0].length + WINDOW));
    push(m.index!, {
      test: "chi2",
      value: parseFloat(m[3]),
      df1: parseFloat(m[1]),
      reportedPText: p?.text,
    }, m[0]);
  }

  // r(df) = v, p ...
  for (const m of text.matchAll(
    /\br\s*\(\s*(\d+)\s*\)\s*(=|<|>)\s*(-?\d?\.?\d+)/g)) {
    const p = findP(text.slice(m.index! + m[0].length, m.index! + m[0].length + WINDOW));
    push(m.index!, {
      test: "r",
      value: parseFloat(m[3]),
      n: parseFloat(m[1]) + 2,
      reportedPText: p?.text,
    }, m[0]);
  }

  // r = v (no parentheses) with a nearby n and p, e.g. "r = .34 ... n = 42, p = .02"
  for (const m of text.matchAll(/\br\s*=\s*(-?0?\.\d+)\b/g)) {
    const end = m.index! + m[0].length;
    const p = findP(text.slice(end, end + 90));
    if (!p) continue; // need a p-value to treat it as a reported test
    const ctx = text.slice(Math.max(0, m.index! - 90), end + 90);
    const nm = /\b[nN]\s*=\s*(\d{2,5})\b/.exec(ctx);
    if (!nm) continue; // pFromR needs n
    const rv = parseFloat(m[1].replace(/^-\./, "-0.").replace(/^\./, "0."));
    if (Math.abs(rv) >= 1) continue;
    push(m.index!, { test: "r", value: rv, n: parseInt(nm[1], 10), reportedPText: p.text }, m[0]);
  }

  // t = v with a separately-reported df, e.g. "t = 2.35, df = 28, p = .02"
  for (const m of text.matchAll(/\bt\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
    const end = m.index! + m[0].length;
    const win = text.slice(end, end + 90);
    const dfm = /\bdf\s*=\s*(\d+(?:\.\d+)?)/.exec(win);
    const p = findP(win);
    if (!dfm || !p) continue;
    push(m.index!, {
      test: "t",
      value: Math.abs(parseFloat(m[1])),
      df1: parseFloat(dfm[1]),
      reportedPText: p.text,
    }, m[0]);
  }

  // z = v, p ...
  for (const m of text.matchAll(/\bz\s*(=|<|>)\s*(-?\d*\.?\d+)/g)) {
    const p = findP(text.slice(m.index! + m[0].length, m.index! + m[0].length + WINDOW));
    if (!p) continue; // bare "z = .." with no p is too noisy to keep
    push(m.index!, {
      test: "z",
      value: Math.abs(parseFloat(m[2])),
      reportedPText: p.text,
    }, m[0]);
  }

  const pValues: number[] = [];
  for (const e of evidence) {
    if (e.stat?.reportedPText) {
      const v = parseFloat(e.stat.reportedPText.replace(/^\./, "0."));
      if (isFinite(v)) pValues.push(v);
    }
  }
  return { evidence, pValues };
}

/** Extract mean ± SD descriptives with a nearby sample size (for GRIM/SPRITE). */
export function extractDescriptives(text: string, section = "Body"): Evidence[] {
  const out: Evidence[] = [];
  // M = x, SD = y  (optionally with n nearby)
  for (const m of text.matchAll(
    /\bM\s*=\s*(\d+\.\d+)\s*,?\s*(?:SD|s)\s*=\s*(\d+\.\d+)/g)) {
    const meanText = m[1];
    const sdText = m[2];
    const after = text.slice(m.index!, m.index! + 120);
    const before = text.slice(Math.max(0, m.index! - 120), m.index!);
    const nm = /\b[nN]\s*=\s*(\d+)/.exec(after) || /\b[nN]\s*=\s*(\d+)/.exec(before);
    if (!nm) continue; // GRIM needs n
    const n = parseInt(nm[1], 10);
    if (!(n >= 2) || n > 999) continue;
    const { quote, start } = sentenceAround(text, m.index!);
    const d: Descriptive = {
      label: quote.slice(0, 48),
      mean: parseFloat(meanText),
      meanText,
      sd: parseFloat(sdText),
      sdText,
      n,
      items: 1,
      integer: true, // assume integer responses unless we learn otherwise
    };
    out.push({
      id: `d${out.length + 1}`,
      kind: "descriptive",
      text: m[0],
      descriptive: d,
      locus: { section, page: 0, quote, charStart: start, charEnd: start + m[0].length },
    });
  }
  return out;
}
