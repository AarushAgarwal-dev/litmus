"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WatchlistEntry } from "@/lib/types";
import { BAND, type Band, pct } from "@/lib/ui";
import { BandPill } from "@/components/primitives";
import { Reveal } from "@/components/reveal";
import {
  IconArrowRight,
  IconArrowUpRight,
  IconSpinner,
  IconX,
  IconActivity,
  IconTarget,
} from "@/components/icons";

interface ReauditResult {
  changed: boolean;
  previous: { band: string; likelihood: number };
  current: { band: string; likelihood: number; auditId: string };
  delta: number;
}

export default function WatchlistPage() {
  const [list, setList] = useState<WatchlistEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ReauditResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((j) => setList(j.watchlist ?? []))
      .catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  const reaudit = useCallback(async (id: string) => {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch("/api/reaudit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Re-audit failed");
      setResults((r) => ({ ...r, [id]: j }));
      load();
    } catch (e) {
      setErrors((er) => ({ ...er, [id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  }, [load]);

  const remove = useCallback(async (id: string) => {
    setList((l) => (l ?? []).filter((e) => e.id !== id));
    await fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <Reveal>
        <span className="eyebrow">Living re-audit</span>
        <h1 className="display mt-3 text-ink" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
          Watchlist.
        </h1>
        <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-muted">
          A claim&rsquo;s standing isn&rsquo;t fixed. New replications and
          contradicting results arrive all the time. Re-audit a watched paper to
          check whether its verdict has moved against the current literature.
        </p>
      </Reveal>

      <div className="mt-10">
        {list === null && (
          <div className="flex items-center gap-2 text-muted">
            <IconSpinner width={16} height={16} /> Loading watchlist...
          </div>
        )}

        {list?.length === 0 && (
          <div className="card flex flex-col items-center gap-4 p-12 text-center">
            <IconTarget width={26} height={26} style={{ color: "var(--color-faint)" }} />
            <p className="serif text-lg text-ink" style={{ fontWeight: 500 }}>Nothing on the watchlist yet.</p>
            <p className="max-w-sm text-sm text-muted">
              Run an audit on a DOI or an example, then click <span className="font-medium text-ink">Watch this paper</span> on the report to track it here.
            </p>
            <Link href="/audit" className="btn btn-clay">
              Run an audit
              <IconArrowRight width={16} height={16} />
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {list?.map((e) => {
            const res = results[e.id];
            const band = e.band as Band;
            return (
              <Reveal key={e.id}>
                <div className="card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <BandPill band={band} />
                        <span className="pill pill-neutral">{e.field}</span>
                        {e.doi && <span className="mono text-[0.7rem] text-faint">doi:{e.doi}</span>}
                      </div>
                      <Link href={`/audit/${e.id}`} className="mt-2.5 block">
                        <p className="serif text-[1.08rem] leading-snug text-ink hover:text-clay-ink" style={{ fontWeight: 500 }}>
                          {e.title}
                        </p>
                      </Link>
                      <p className="mt-1 text-xs text-faint">
                        {band === "abstained" ? "abstained" : pct(e.likelihood)} likelihood · last audited{" "}
                        {new Date(e.lastAuditedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        onClick={() => reaudit(e.id)}
                        disabled={busy === e.id || !(e.doi || e.demoId)}
                        className="btn btn-ghost btn-sm"
                        title={e.doi || e.demoId ? "Re-run against current literature" : "Text audits can't be re-run"}
                      >
                        {busy === e.id ? <IconSpinner width={14} height={14} /> : <IconActivity width={14} height={14} />}
                        Re-audit
                      </button>
                      <button onClick={() => remove(e.id)} className="text-xs text-faint hover:text-brick">
                        Remove
                      </button>
                    </div>
                  </div>

                  {errors[e.id] && (
                    <p className="mt-3 text-xs" style={{ color: "var(--color-brick)" }}>{errors[e.id]}</p>
                  )}

                  {res && (
                    <div
                      className="mt-4 rounded-xl border p-4"
                      style={{
                        borderColor: res.changed ? "var(--color-clay-line)" : "var(--color-line)",
                        background: res.changed ? "var(--color-clay-wash)" : "var(--color-paper-2)",
                      }}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {res.changed ? (
                          <span className="font-semibold" style={{ color: "var(--color-clay-ink)" }}>The verdict moved.</span>
                        ) : (
                          <span className="font-medium text-ink">No material change.</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[0.9rem]">
                        <VerdictChip band={res.previous.band as Band} likelihood={res.previous.likelihood} muted />
                        <IconArrowRight width={16} height={16} style={{ color: "var(--color-faint)" }} />
                        <VerdictChip band={res.current.band as Band} likelihood={res.current.likelihood} />
                        <Link href={`/audit/${res.current.auditId}`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium link-ul" style={{ color: "var(--color-clay-ink)" }}>
                          View report <IconArrowUpRight width={13} height={13} />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VerdictChip({ band, likelihood, muted }: { band: Band; likelihood: number; muted?: boolean }) {
  const b = BAND[band];
  return (
    <span className="inline-flex items-center gap-1.5" style={{ opacity: muted ? 0.7 : 1 }}>
      <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
      <span className="text-ink-2">{b.label}</span>
      <span className="mono text-xs text-faint">{band === "abstained" ? "n/a" : pct(likelihood)}</span>
    </span>
  );
}
