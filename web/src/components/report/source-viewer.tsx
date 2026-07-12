"use client";

import { useMemo } from "react";
import type { AuditReport, CheckStatus } from "@/lib/types";
import { STATUS } from "@/lib/ui";
import { IconQuote } from "@/components/icons";

/** Scroll an element into view and pulse it. */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash");
  // reflow so the animation restarts
  void el.offsetWidth;
  el.classList.add("flash");
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Span {
  start: number;
  end: number;
  evidenceId: string;
  status: CheckStatus;
}

const RANK: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2, na: 3 };

export function SourceViewer({ report }: { report: AuditReport }) {
  const source = report.sourceText ?? "";

  // worst check status per evidence id
  const statusByEvidence = useMemo(() => {
    const m = new Map<string, CheckStatus>();
    for (const c of report.checks) {
      if (!c.evidenceId) continue;
      const prev = m.get(c.evidenceId);
      if (prev == null || RANK[c.status] < RANK[prev]) m.set(c.evidenceId, c.status);
    }
    return m;
  }, [report.checks]);

  const segments = useMemo(() => {
    if (!source) return [] as ({ text: string } | Span & { text: string })[];
    const spans: Span[] = [];
    for (const e of report.evidence) {
      const quote = e.locus?.quote;
      if (!quote) continue;
      const tokens = quote.trim().split(/\s+/).map(escapeRe).filter(Boolean).slice(0, 26);
      if (tokens.length === 0) continue;
      let re: RegExp;
      try {
        re = new RegExp(tokens.join("\\s+"), "i");
      } catch {
        continue;
      }
      const m = re.exec(source);
      if (!m) continue;
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        evidenceId: e.id,
        status: statusByEvidence.get(e.id) ?? "na",
      });
    }
    spans.sort((a, b) => a.start - b.start);
    // drop overlaps (keep earlier)
    const kept: Span[] = [];
    let lastEnd = -1;
    for (const s of spans) {
      if (s.start >= lastEnd) {
        kept.push(s);
        lastEnd = s.end;
      }
    }
    const out: ({ text: string } | (Span & { text: string }))[] = [];
    let cursor = 0;
    for (const s of kept) {
      if (s.start > cursor) out.push({ text: source.slice(cursor, s.start) });
      out.push({ ...s, text: source.slice(s.start, s.end) });
      cursor = s.end;
    }
    if (cursor < source.length) out.push({ text: source.slice(cursor) });
    return out;
  }, [source, report.evidence, statusByEvidence]);

  if (!source) return null;
  const highlighted = segments.filter((s) => "evidenceId" in s).length;
  const truncated = source.length >= 48000;

  return (
    <section className="card p-6 sm:p-7">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--color-paper-2)", color: "var(--color-clay-ink)" }}>
          <IconQuote width={16} height={16} />
        </span>
        <div>
          <h3 className="serif text-lg leading-none text-ink" style={{ fontWeight: 500 }}>Source &amp; evidence</h3>
          <p className="mt-1 text-xs text-faint">{highlighted} extracted item{highlighted === 1 ? "" : "s"} highlighted. Click one to jump to its check.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[0.72rem] text-muted">
        <Legend status="fail" /> <Legend status="warn" /> <Legend status="pass" />
      </div>

      <div
        className="mt-3 max-h-[26rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-line p-4 text-[0.9rem] leading-relaxed text-ink-2"
        style={{ background: "var(--color-paper)" }}
      >
        {segments.map((seg, i) =>
          "evidenceId" in seg ? (
            <button
              key={i}
              id={`src-${seg.evidenceId}`}
              onClick={() => jumpTo(`chk-${seg.evidenceId}`)}
              className="rounded px-0.5 text-left transition-[background]"
              style={{
                background: tint(seg.status),
                color: STATUS[seg.status].color,
                fontWeight: 500,
                boxDecorationBreak: "clone",
                WebkitBoxDecorationBreak: "clone",
              }}
              title={`${STATUS[seg.status].label} · click to see the check`}
            >
              {seg.text}
            </button>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
      {truncated && <p className="mt-2 text-xs text-faint">Source truncated to the first 48,000 characters.</p>}
    </section>
  );
}

function tint(status: CheckStatus): string {
  switch (status) {
    case "fail":
      return "var(--color-brick-wash)";
    case "warn":
      return "var(--color-amber-wash)";
    case "pass":
      return "var(--color-sage-wash)";
    default:
      return "var(--color-clay-wash)";
  }
}

function Legend({ status }: { status: CheckStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-4 rounded" style={{ background: tint(status), border: `1px solid ${STATUS[status].color}` }} />
      {STATUS[status].label}
    </span>
  );
}
