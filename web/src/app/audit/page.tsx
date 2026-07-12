"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AuditReport, StageEvent, AuditSummary } from "@/lib/types";
import { DEMO_CATALOG, type CatalogEntry } from "@/lib/demo/catalog";
import { BAND, pct, type Band } from "@/lib/ui";
import { ReportView } from "@/components/report/report-view";
import { Reveal } from "@/components/reveal";
import {
  IconArrowRight,
  IconCheck,
  IconSpinner,
  IconActivity,
  IconLayers,
  IconScale,
  IconShield,
  IconGauge,
  IconDoc,
  IconTarget,
  IconSearch,
  IconQuote,
  IconExternal,
} from "@/components/icons";

type StageKey = "parse" | "extract" | "intrinsic" | "retrieve" | "adjudicate" | "calibrate" | "verify";

const STAGES: { key: StageKey; label: string; icon: React.ReactNode }[] = [
  { key: "parse", label: "Ingest & parse", icon: <IconDoc width={15} height={15} /> },
  { key: "extract", label: "Extract claim graph", icon: <IconLayers width={15} height={15} /> },
  { key: "intrinsic", label: "Deterministic checks", icon: <IconActivity width={15} height={15} /> },
  { key: "retrieve", label: "Retrieve related work", icon: <IconScale width={15} height={15} /> },
  { key: "adjudicate", label: "Adjudicate", icon: <IconGauge width={15} height={15} /> },
  { key: "calibrate", label: "Calibrate", icon: <IconTarget width={15} height={15} /> },
  { key: "verify", label: "Ground & verify", icon: <IconShield width={15} height={15} /> },
];

type StageStatus = "idle" | "active" | "done";
interface LogLine {
  stage?: string;
  message: string;
}
type Mode = "doi" | "text" | "pdf" | "examples";

export default function AuditPage() {
  const [mode, setMode] = useState<Mode>("doi");
  const [doi, setDoi] = useState("");
  const [text, setText] = useState("");
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState(
    (DEMO_CATALOG.find((c) => !c.real) ?? DEMO_CATALOG[0]).id,
  );

  const [running, setRunning] = useState(false);
  const [stageStatus, setStageStatus] = useState<Record<string, StageStatus>>({});
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(true);
  const [claudeOn, setClaudeOn] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<AuditSummary[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((j) => setClaudeOn(!!j.claude)).catch(() => setClaudeOn(false));
  }, []);
  const loadRecent = useCallback(() => {
    fetch("/api/audits?limit=6").then((r) => r.json()).then((j) => setRecent(j.audits ?? [])).catch(() => {});
  }, []);
  useEffect(loadRecent, [loadRecent]);

  const runWithBody = useCallback(async (body: Record<string, string>) => {
    setRunning(true);
    setReport(null);
    setError(null);
    setLogs([]);
    setProgress(0);
    setShowLog(true);
    setStageStatus(Object.fromEntries(STAGES.map((s) => [s.key, "idle"])));

    const handleEvent = (ev: StageEvent) => {
      if (ev.progress != null) setProgress(ev.progress);
      if (ev.type === "stage" && ev.stage) {
        setStageStatus((prev) => {
          const next = { ...prev };
          if (ev.status === "start" || ev.status === "active") next[ev.stage!] = "active";
          if (ev.status === "done") next[ev.stage!] = "done";
          return next;
        });
        if (ev.message) setLogs((l) => [...l, { stage: ev.stage, message: ev.message! }]);
      } else if (ev.type === "log" && ev.message) {
        setLogs((l) => [...l, { stage: ev.stage, message: ev.message! }]);
      } else if (ev.type === "done" && ev.report) {
        setReport(ev.report);
        setStageStatus(Object.fromEntries(STAGES.map((s) => [s.key, "done"])));
        setProgress(1);
        setTimeout(() => setShowLog(false), 400);
        loadRecent();
      } else if (ev.type === "error") {
        setError(ev.message ?? "Unknown error");
      }
    };

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok && !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          handleEvent(JSON.parse(line) as StageEvent);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [loadRecent]);

  const run = useCallback(async () => {
    if (mode === "doi") {
      if (!doi.trim()) return setError("Enter a DOI.");
      await runWithBody({ doi: doi.trim() });
    } else if (mode === "text") {
      if (text.trim().length < 40) return setError("Paste at least a paragraph.");
      await runWithBody({ text });
    } else if (mode === "examples") {
      await runWithBody({ demoId: selectedDemo });
    } else if (mode === "pdf") {
      if (!text) return setError("Choose a PDF first.");
      const body: Record<string, string> = { text };
      if (pdfName) body.title = pdfName;
      if (pdfBase64) body.pdfBase64 = pdfBase64; // enables Claude PDF vision when a key is set
      await runWithBody(body);
    }
  }, [mode, doi, text, selectedDemo, pdfName, pdfBase64, runWithBody]);

  const onPdf = useCallback(async (file: File) => {
    setError(null);
    setPdfBusy(true);
    setPdfName(file.name);
    setText("");
    setPdfBase64(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-pdf", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "PDF extraction failed");
      setText(j.text);
      // When the Claude path is active, also keep the PDF bytes for figure/table vision.
      if (claudeOn && file.size < 6 * 1024 * 1024) {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = reject;
          fr.readAsDataURL(file);
        });
        setPdfBase64(dataUrl.split(",")[1] ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPdfName(null);
    } finally {
      setPdfBusy(false);
    }
  }, [claudeOn]);

  const permalink = report?.meta.auditId ? `/audit/${report.meta.auditId}` : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <Reveal>
        <div className="flex flex-wrap items-center gap-3">
          <span className="eyebrow">The auditor</span>
          {claudeOn !== null && (
            <span className={`pill ${claudeOn ? "pill-sage" : "pill-neutral"}`} title={claudeOn ? "Claude claim-extraction, adjudication & stance are active" : "Set ANTHROPIC_API_KEY to enable the Claude path"}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: claudeOn ? "var(--color-sage)" : "var(--color-faint)" }} />
              {claudeOn ? "Claude path active" : "Deterministic engine"}
            </span>
          )}
        </div>
        <h1 className="display mt-3 text-ink" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
          Audit any paper. Watch it work.
        </h1>
        <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-muted">
          Give Litmus a DOI, paste the text, or drop a PDF. It ingests the real
          paper, extracts the reported statistics, runs the forensic checks,
          retrieves related work, and returns a grounded, calibrated verdict in real time. No API key required.
        </p>
      </Reveal>

      {/* input */}
      <div className="mt-8 card p-2">
        <div className="flex flex-wrap gap-1 border-b border-line p-2">
          {([
            ["doi", "DOI", <IconSearch key="a" width={15} height={15} />],
            ["text", "Paste text", <IconQuote key="b" width={15} height={15} />],
            ["pdf", "PDF", <IconDoc key="c" width={15} height={15} />],
            ["examples", "Examples", <IconLayers key="d" width={15} height={15} />],
          ] as [Mode, string, React.ReactNode][]).map(([m, label, icon]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
              style={{
                background: mode === m ? "var(--color-ink)" : "transparent",
                color: mode === m ? "var(--color-paper)" : "var(--color-muted)",
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          {mode === "doi" && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !running && run()}
                placeholder="10.1038/s41586-020-2649-2  ·  or a doi.org URL"
                disabled={running}
                className="mono flex-1 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink outline-none placeholder:text-faint focus:border-clay-line"
              />
              <button className="btn btn-clay" onClick={run} disabled={running}>
                {running ? <><IconSpinner width={16} height={16} />Auditing…</> : <>Audit<IconArrowRight width={16} height={16} /></>}
              </button>
            </div>
          )}

          {mode === "text" && (
            <div className="space-y-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the paper's abstract, results, or full text, anything with reported statistics like t(28) = 2.1, p = .03…"
                disabled={running}
                rows={7}
                className="w-full resize-y rounded-xl border border-line bg-paper px-4 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-faint focus:border-clay-line"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-faint">{text.length.toLocaleString()} characters</span>
                <button className="btn btn-clay" onClick={run} disabled={running}>
                  {running ? <><IconSpinner width={16} height={16} />Auditing…</> : <>Audit<IconArrowRight width={16} height={16} /></>}
                </button>
              </div>
            </div>
          )}

          {mode === "pdf" && (
            <div className="space-y-3">
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onPdf(e.target.files[0])}
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={running || pdfBusy}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 transition-colors hover:border-clay-line"
                style={{ borderColor: "var(--color-line-2)", background: "var(--color-paper)" }}
              >
                {pdfBusy ? (
                  <><IconSpinner width={22} height={22} style={{ color: "var(--color-clay-ink)" }} /><span className="text-sm text-muted">Extracting text…</span></>
                ) : pdfName ? (
                  <><IconCheck width={22} height={22} style={{ color: "var(--color-sage)" }} /><span className="text-sm text-ink">{pdfName}</span><span className="text-xs text-faint">{text.length.toLocaleString()} chars extracted · click to replace</span></>
                ) : (
                  <><IconDoc width={24} height={24} style={{ color: "var(--color-faint)" }} /><span className="text-sm font-medium text-ink">Choose a PDF</span><span className="text-xs text-faint">Text-based PDFs only (no OCR) · max 40 MB</span></>
                )}
              </button>
              {text && !pdfBusy && (
                <div className="flex justify-end">
                  <button className="btn btn-clay" onClick={run} disabled={running}>
                    {running ? <><IconSpinner width={16} height={16} />Auditing…</> : <>Audit<IconArrowRight width={16} height={16} /></>}
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "examples" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {DEMO_CATALOG.map((c) => (
                  <CaseCard key={c.id} entry={c} selected={selectedDemo === c.id} disabled={running} onSelect={() => setSelectedDemo(c.id)} />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button className="btn btn-clay" onClick={run} disabled={running}>
                  {running ? <><IconSpinner width={16} height={16} />Auditing…</> : <>Run selected illustration<IconArrowRight width={16} height={16} /></>}
                </button>
                <span className="text-sm text-faint">
                  The first two are live audits of real papers (open instantly). The rest are illustrations with crafted statistics that trip the forensic checks.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {mode !== "examples" && (
        <p className="mt-3 text-xs text-faint">
          Real papers: the deterministic statistical forensics and OpenAlex retrieval run for real.
          Multi-claim decomposition and literature stance-classification activate with an <span className="mono">ANTHROPIC_API_KEY</span>.
        </p>
      )}

      {/* recent audits */}
      {recent.length > 0 && !report && !running && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="overline">Recent audits</span>
            <Link href="/watchlist" className="text-xs font-medium text-muted hover:text-ink">Watchlist</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((a) => {
              const b = BAND[a.band as Band] ?? BAND.mixed;
              return (
                <Link key={a.id} href={`/audit/${a.id}`} className="card-quiet flex items-center gap-3 p-3.5 transition-shadow hover:shadow-[var(--shadow-sm)]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.85rem] font-medium text-ink">{a.title}</span>
                    <span className="text-[0.72rem] text-faint">{b.label} · {a.band === "abstained" ? "n/a" : pct(a.likelihood)} · {a.field}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* console */}
      {(running || report || error) && (
        <div className="mt-8">
          <Console stageStatus={stageStatus} logs={logs} progress={progress} running={running} show={showLog} onToggle={() => setShowLog((s) => !s)} done={!!report} />
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "var(--color-brick)", background: "var(--color-brick-wash)" }}>
          <p className="text-sm" style={{ color: "var(--color-brick)" }}>{error}</p>
        </div>
      )}

      {/* report */}
      {report && (
        <div className="mt-8">
          {permalink && (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted">
              <IconExternal width={14} height={14} />
              Permalink:{" "}
              <Link href={permalink} className="mono text-clay-ink link-ul" style={{ color: "var(--color-clay-ink)" }}>
                {permalink}
              </Link>
            </div>
          )}
          <ReportView report={report} />
        </div>
      )}
    </div>
  );
}

function CaseCard({ entry, selected, disabled, onSelect }: { entry: CatalogEntry; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="pill pill-neutral" style={{ fontSize: "0.66rem" }}>{entry.field}</span>
        {entry.real ? (
          <span className="pill pill-sage" style={{ fontSize: "0.62rem" }}>real · cached</span>
        ) : (
          <span className="pill pill-neutral" style={{ fontSize: "0.62rem" }}>illustration</span>
        )}
      </div>
      <p className="serif mt-3 flex-1 text-[0.98rem] leading-snug text-ink" style={{ fontWeight: 500 }}>{entry.title}</p>
      <p className="mt-2 text-[0.78rem] leading-snug text-muted">{entry.tagline}</p>
      <p className="mt-2.5 text-[0.7rem] text-faint">{entry.authorsShort} · {entry.year}</p>
    </>
  );
  // Real papers open their cached audit instantly; illustrations are selectable to run.
  if (entry.real && entry.permalink) {
    return (
      <Link
        href={entry.permalink}
        className="group relative flex h-full flex-col rounded-2xl border p-4 text-left transition-all hover:shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-sage)", background: "var(--color-card)", boxShadow: "var(--shadow-xs)" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="group relative flex h-full flex-col rounded-2xl border p-4 text-left transition-all disabled:opacity-60"
      style={{
        borderColor: selected ? "var(--color-clay)" : "var(--color-line)",
        background: selected ? "var(--color-clay-wash)" : "var(--color-card)",
        boxShadow: selected ? "0 6px 20px -12px rgba(158,68,41,0.4)" : "var(--shadow-xs)",
      }}
    >
      {inner}
    </button>
  );
}

function Console({ stageStatus, logs, progress, running, show, onToggle, done }: {
  stageStatus: Record<string, StageStatus>; logs: LogLine[]; progress: number; running: boolean; show: boolean; onToggle: () => void; done: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="h-1 w-full" style={{ background: "var(--color-paper-3)" }}>
        <div className="h-full transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%`, background: done ? "var(--color-sage)" : "var(--color-clay)" }} />
      </div>
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          {running ? (
            <IconSpinner width={16} height={16} style={{ color: "var(--color-clay-ink)" }} />
          ) : done ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "var(--color-sage)", color: "#fff" }}><IconCheck width={12} height={12} /></span>
          ) : null}
          <span className="text-sm font-medium text-ink">{done ? "Audit complete" : "Running pipeline…"}</span>
        </div>
        <button onClick={onToggle} className="text-xs font-medium text-muted hover:text-ink">{show ? "Hide run log" : "Show run log"}</button>
      </div>

      {show && (
        <div className="grid gap-0 border-t border-line md:grid-cols-[240px_1fr]">
          <div className="border-b border-line p-4 md:border-b-0 md:border-r">
            <ol className="space-y-1">
              {STAGES.map((s) => {
                const st = stageStatus[s.key] ?? "idle";
                return (
                  <li key={s.key} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors" style={{ background: st === "done" ? "var(--color-sage)" : st === "active" ? "var(--color-clay)" : "var(--color-paper-3)", color: st === "idle" ? "var(--color-faint)" : "#fff" }}>
                      {st === "done" ? <IconCheck width={13} height={13} /> : st === "active" ? <IconSpinner width={13} height={13} /> : s.icon}
                    </span>
                    <span className="text-[0.82rem] transition-colors" style={{ color: st === "idle" ? "var(--color-faint)" : "var(--color-ink)", fontWeight: st === "active" ? 600 : 400 }}>{s.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }} className="mono max-h-72 overflow-y-auto p-4 text-[0.76rem] leading-relaxed" style={{ background: "var(--color-paper)" }}>
            {logs.length === 0 && <p className="text-faint">Waiting for the first event…</p>}
            {logs.map((l, i) => <LogRow key={i} line={l} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function LogRow({ line }: { line: LogLine }) {
  const isFail = line.message.startsWith("⚑") || /fail|inconsistency|impossible|failed replication|contradict/i.test(line.message);
  return (
    <div className="flex gap-2 py-0.5" style={{ animation: "fadein 0.3s ease" }}>
      {line.stage && <span className="shrink-0 text-faint">{line.stage.slice(0, 4).padEnd(4)}</span>}
      <span style={{ color: isFail ? "var(--color-brick)" : "var(--color-ink-2)" }}>{line.message}</span>
    </div>
  );
}
