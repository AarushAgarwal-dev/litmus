/**
 * extract/tables.ts, pull descriptives out of structured tables (JATS XML).
 *
 * Many papers report means and SDs only in tables, where the inline scraper
 * can't see them. This parses `<table-wrap>` blocks: it locates Mean / SD / N
 * columns (or a combined "M (SD)" column), and emits a Descriptive per row so
 * GRIM / GRIMMER / SPRITE can run on tabulated numbers too.
 *
 * Each emitted item also produces a reconstructed source line (returned in
 * `lines`) that the caller appends to the source text, so the finding stays
 * groundable, and, crucially, that line uses lowercase "mean/sd" wording the
 * inline regex ignores, so nothing is double-counted.
 */

import type { Evidence, Descriptive } from "../types";

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(s: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(s.replace(/,/g, ""));
  return m ? parseFloat(m[0]) : null;
}
function rawNum(s: string): string | null {
  const m = /-?\d+(?:\.\d+)?/.exec(s.replace(/,/g, ""));
  return m ? m[0] : null;
}

function scaleFrom(caption: string): { min: number; max: number } | null {
  const m = /\b(\d)\s*(?:-|–|to)\s*(\d)\b/.exec(caption);
  if (!m) return null;
  const lo = parseInt(m[1], 10);
  const hi = parseInt(m[2], 10);
  return hi > lo && hi <= 100 ? { min: lo, max: hi } : null;
}

interface ColMap {
  label: number;
  mean: number;
  sd: number;
  n: number;
  combo: number;
}

function findColumns(headers: string[]): ColMap {
  const idx = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const combo = headers.findIndex((h) => /m\s*\(\s*sd\s*\)|mean\s*\(\s*sd\s*\)/i.test(h));
  const mean = idx(/^m$|\bmean\b|\bm\b/i);
  const sd = idx(/\bsd\b|\bs\.?d\.?\b|std|standard deviation/i);
  const n = idx(/^n$|\bn\b|sample size|no\.? of/i);
  const label = headers.findIndex((h, i) => i !== mean && i !== sd && i !== n && i !== combo);
  return { label: label < 0 ? 0 : label, mean, sd, n, combo };
}

export function extractTableEvidence(xml: string): { evidence: Evidence[]; lines: string[] } {
  const evidence: Evidence[] = [];
  const lines: string[] = [];
  let counter = 0;

  const wraps = xml.match(/<table-wrap[\s\S]*?<\/table-wrap>/gi) || xml.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const wrap of wraps.slice(0, 30)) {
    try {
      const capM = /<caption[\s\S]*?<\/caption>|<title[\s\S]*?<\/title>|<label[\s\S]*?<\/label>/i.exec(wrap);
      const caption = capM ? stripTags(capM[0]) : "Table";
      const scale = scaleFrom(caption);
      const integerHint = /score|rating|likert|item|response|scale/i.test(caption);

      const table = /<table[\s\S]*?<\/table>/i.exec(wrap)?.[0] ?? wrap;
      const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      if (rows.length < 2) continue;
      const cellsOf = (tr: string) =>
        (tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map((c) => stripTags(c));

      const headers = cellsOf(rows[0] ?? "").map((h) => h.toLowerCase());
      const cols = findColumns(headers);
      const hasCombo = cols.combo >= 0;
      const hasMeanSd = cols.mean >= 0 && cols.sd >= 0;
      if (!hasCombo && !hasMeanSd) continue;

      for (const tr of rows.slice(1)) {
        const cells = cellsOf(tr);
        if (cells.length < 2) continue;

        let meanText: string | null = null;
        let sdText: string | null = null;
        if (hasCombo && cells[cols.combo]) {
          const m = /(-?\d+(?:\.\d+)?)\s*\(\s*(\d+(?:\.\d+)?)\s*\)/.exec(cells[cols.combo]);
          if (m) {
            meanText = m[1];
            sdText = m[2];
          }
        }
        if ((!meanText || !sdText) && hasMeanSd) {
          meanText = rawNum(cells[cols.mean] ?? "");
          sdText = rawNum(cells[cols.sd] ?? "");
        }
        if (!meanText || !sdText) continue;

        let n: number | null = cols.n >= 0 ? num(cells[cols.n] ?? "") : null;
        if (n == null) n = num(caption); // sometimes "n = 30" is in the caption
        if (n == null || !(n >= 2) || n > 5000) continue;

        const mean = parseFloat(meanText);
        const sd = parseFloat(sdText);
        if (!isFinite(mean) || !isFinite(sd)) continue;

        const label = (cells[cols.label] || caption).slice(0, 60);
        const line = `Table, ${label}: mean ${meanText}, sd ${sdText}, n=${Math.round(n)}${scale ? ` (${scale.min}–${scale.max} scale)` : ""}.`;
        lines.push(line);
        counter += 1;
        const d: Descriptive = {
          label,
          mean,
          meanText,
          sd,
          sdText,
          n: Math.round(n),
          items: 1,
          integer: !!scale || integerHint,
          scaleMin: scale?.min,
          scaleMax: scale?.max,
        };
        evidence.push({
          id: `t${counter}`,
          kind: "descriptive",
          text: line,
          descriptive: d,
          locus: { section: "Table", page: 0, quote: line },
        });
        if (evidence.length >= 60) break;
      }
    } catch {
      /* skip unparseable tables */
    }
    if (evidence.length >= 60) break;
  }
  return { evidence, lines };
}
