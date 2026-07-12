"use client";

import { memo, useState } from "react";
import type {
  AuditReport,
  CheckResult,
  Claim,
  Verdict,
  RetrievedWork,
  Evidence,
} from "@/lib/types";
import { DeferUntilVisible, SectionBoundary } from "./defer";
import { BAND, STATUS, CHECK_META, SEVERITY_RANK, severityLabel, isMetaClaim, pct, pRound } from "@/lib/ui";
import { ScoreDial, LikelihoodBar, BandPill } from "@/components/primitives";
import { SourceViewer, jumpTo } from "./source-viewer";
import {
  IconCheck,
  IconX,
  IconAlert,
  IconMinus,
  IconExternal,
  IconShield,
  IconScale,
  IconQuote,
  IconTarget,
  IconChevron,
  IconActivity,
} from "@/components/icons";

function statusIcon(status: CheckResult["status"], size = 14) {
  const p = { width: size, height: size };
  if (status === "pass") return <IconCheck {...p} />;
  if (status === "warn") return <IconAlert {...p} />;
  if (status === "fail") return <IconX {...p} />;
  return <IconMinus {...p} />;
}

export function ReportView({ report }: { report: AuditReport }) {
  return (
    <div className="space-y-6">
      {report.overall.retracted && (
        <div
          className="flex items-center gap-3 rounded-2xl border p-4"
          style={{ borderColor: "var(--color-brick)", background: "var(--color-brick-wash)" }}
        >
          <IconAlert width={20} height={20} style={{ color: "var(--color-brick)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-brick)" }}>
              This paper is flagged <span className="uppercase">retracted</span> in the literature. Do not build on it.
            </p>
            {report.overall.retractionReason && (
              <p className="mt-1 text-[0.82rem]" style={{ color: "var(--color-brick)" }}>
                Reason: {report.overall.retractionReason}
              </p>
            )}
          </div>
        </div>
      )}
      <OverallCard report={report} />
      {report.narrative && (
        <SectionBoundary label="summary">
          <ExecutiveSummary report={report} />
        </SectionBoundary>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <SectionBoundary label="claims">
            <ClaimsSection report={report} />
          </SectionBoundary>
          <SectionBoundary label="checks">
            <ChecksSection checks={report.checks} evidence={report.evidence} />
          </SectionBoundary>
        </div>
        <div className="space-y-6">
          <SectionBoundary label="signals">
            <SignalsSection report={report} />
          </SectionBoundary>
          <SectionBoundary label="literature">
            <DeferUntilVisible>
              <LiteratureSection report={report} />
            </DeferUntilVisible>
          </SectionBoundary>
          <SectionBoundary label="corpus">
            <DeferUntilVisible>
              <LiveRetrievalSection report={report} />
            </DeferUntilVisible>
          </SectionBoundary>
          <SectionBoundary label="verification">
            <VerificationSection report={report} />
          </SectionBoundary>
          <TrustFooter report={report} />
        </div>
      </div>
      <SectionBoundary label="source">
        <DeferUntilVisible minHeight={400}>
          <SourceViewer report={report} />
        </DeferUntilVisible>
      </SectionBoundary>
    </div>
  );
}

/* ---------------- overall ---------------- */

function OverallCard({ report }: { report: AuditReport }) {
  const o = report.overall;
  const b = BAND[o.band];
  const claimById = (id: string) => report.claims.find((c) => c.id === id);
  return (
    <div className="card overflow-hidden">
      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[auto_1fr] md:gap-10">
        <div className="flex flex-col items-center justify-center">
          <ScoreDial value={o.replicationLikelihood} uncertainty={o.uncertainty} band={o.band} size={188} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <BandPill band={o.band} />
              <span className="pill pill-neutral">{report.paper.field}</span>
              <span className="pill pill-neutral">
                {report.meta.adjudicator === "claude" ? "Adjudicated by Claude" : "Deterministic engine"}
              </span>
            </div>
            <ReportActions report={report} />
          </div>
          <h2 className="serif mt-4 text-[1.6rem] leading-tight text-ink" style={{ fontWeight: 500 }}>
            {report.paper.title}
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {[
              report.paper.authors.length
                ? report.paper.authors.slice(0, 4).join(", ") +
                  (report.paper.authors.length > 4 ? " et al." : "")
                : null,
              report.paper.venue || null,
              report.paper.year ? String(report.paper.year) : null,
              report.paper.doi ? `doi:${report.paper.doi}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Live audit"}
          </p>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-2">{b.blurb}</p>

          <div className="mt-5 flex flex-wrap gap-6">
            <MetaStat label="Calibrated likelihood" value={o.band === "abstained" ? "n/a" : pct(o.replicationLikelihood)} />
            <MetaStat
              label="95% interval"
              value={o.band === "abstained" ? "n/a" : `${pct(o.ciLow)}–${pct(o.ciHigh)}`}
            />
            <MetaStat label="Grounding" value={pct(o.groundingRate)} good />
            <MetaStat label="Checks failed" value={String(report.checks.filter((c) => c.status === "fail").length)} />
          </div>

          {o.verifyFirst.length > 0 && (
            <div className="mt-6 rounded-xl border border-line p-4" style={{ background: "var(--color-paper-2)" }}>
              <div className="flex items-center gap-2">
                <IconTarget width={15} height={15} style={{ color: "var(--color-clay-ink)" }} />
                <span className="overline">Verify these first</span>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {o.verifyFirst.map((id) => {
                  const c = claimById(id);
                  if (!c) return null;
                  return (
                    <li key={id} className="flex items-start gap-2 text-[0.88rem] text-ink-2">
                      <span className="mono mt-px text-[0.7rem] text-faint">{id}</span>
                      <span className="line-clamp-1">{c.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-line px-6 py-3 sm:px-8">
        <p className="text-xs leading-relaxed text-faint">
          <span className="font-medium text-muted">Calibration.</span> {o.calibrationNote}{" "}
          {report.meta.tokensNote}
        </p>
      </div>
    </div>
  );
}

/* ---------------- executive summary ---------------- */

function ExecutiveSummary({ report }: { report: AuditReport }) {
  // Reflect who actually wrote the summary; fall back to the adjudicator for
  // reports generated before this field existed.
  const byClaude = report.meta.narrativeByClaude ?? report.meta.adjudicator === "claude";
  return (
    <section className="card overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 border-b border-line px-6 py-3.5 sm:px-7"
        style={{ background: "var(--color-paper-2)" }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "var(--color-card)", color: "var(--color-clay-ink)" }}
          >
            <IconQuote width={16} height={16} />
          </span>
          <h3 className="serif text-lg text-ink" style={{ fontWeight: 500 }}>
            Executive summary
          </h3>
        </div>
        <span className="pill pill-neutral" style={{ fontSize: "0.66rem" }}>
          {byClaude ? "Written by Claude" : "Deterministic"} · grounded in the results
        </span>
      </div>
      <div className="px-6 py-5 sm:px-7">
        <p className="serif text-[1.02rem] leading-relaxed text-ink-2" style={{ fontWeight: 400 }}>
          {report.narrative}
        </p>
      </div>
    </section>
  );
}

/* ---------------- transparency & provenance ---------------- */

function SignalsSection({ report }: { report: AuditReport }) {
  const s = report.signals;
  if (!s) return null;
  const hasAny =
    s.openAccess != null ||
    s.hasPreprint ||
    (s.registeredTrials?.length ?? 0) > 0 ||
    (s.funders?.length ?? 0) > 0;
  if (!hasAny) return null;
  return (
    <section className="card p-6 sm:p-7">
      <SectionHead icon={<IconShield width={16} height={16} />} title="Transparency & provenance" />
      <p className="mt-2 text-[0.85rem] text-muted">
        Independent openness signals resolved live from the DOI. Openness and pre-registration
        predict reproducibility; they are not proof a finding is correct.
      </p>
      <div className="mt-4 space-y-2.5">
        {s.openAccess != null && (
          <SignalRow
            good={!!s.openAccess}
            label={s.openAccess ? `Open access${s.oaStatus ? ` · ${s.oaStatus}` : ""}` : "Not open access"}
            detail={s.openAccess ? "Full text is readable by anyone for independent scrutiny." : "Full text sits behind a paywall, limiting scrutiny."}
            href={s.oaUrl}
            hrefLabel="Read"
          />
        )}
        {s.hasPreprint && (
          <SignalRow
            good
            label={`Preprint on ${s.preprintServer}${s.preprintDate ? ` · ${s.preprintDate.slice(0, 4)}` : ""}`}
            detail={
              s.daysToPublish != null
                ? `Public ${s.daysToPublish} days before publication; the pre-review version is comparable.`
                : "A pre-review version is on the public record."
            }
            href={s.preprintDoi ? `https://doi.org/${s.preprintDoi}` : undefined}
            hrefLabel="Preprint"
          />
        )}
        {s.registeredTrials?.map((t) => (
          <SignalRow
            key={t.nctId}
            good
            label={`Registered trial · ${t.nctId}`}
            detail={`${t.title}${t.status ? ` (${t.status.toLowerCase().replace(/_/g, " ")})` : ""}`}
            href={t.url}
            hrefLabel="Registry"
          />
        ))}
        {s.funders && s.funders.length > 0 && (
          <SignalRow
            neutral
            label="Declared funders"
            detail={s.funders.join("; ")}
          />
        )}
      </div>
    </section>
  );
}

function SignalRow({
  good,
  neutral,
  label,
  detail,
  href,
  hrefLabel,
}: {
  good?: boolean;
  neutral?: boolean;
  label: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
}) {
  const color = neutral ? "var(--color-faint)" : good ? "var(--color-sage)" : "var(--color-amber)";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line p-3.5">
      <span
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: color, color: "#fff" }}
      >
        {neutral ? <IconMinus width={13} height={13} /> : good ? <IconCheck width={13} height={13} /> : <IconAlert width={13} height={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.86rem] font-medium text-ink">{label}</span>
          {href && hrefLabel && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-[0.74rem]"
              style={{ color: "var(--color-clay-ink)" }}
            >
              {hrefLabel}
              <IconExternal width={11} height={11} />
            </a>
          )}
        </div>
        <p className="mt-0.5 text-[0.8rem] leading-snug text-muted">{detail}</p>
      </div>
    </div>
  );
}

function ReportActions({ report }: { report: AuditReport }) {
  const id = report.meta.auditId;
  const [watched, setWatched] = useState(false);
  const [copied, setCopied] = useState(false);

  const watch = async () => {
    if (!id) return;
    const r = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.ok) setWatched(true);
  };
  const copy = () => {
    if (!id) return;
    navigator.clipboard?.writeText(`${location.origin}/audit/${id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `litmus-${id ?? "report"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="flex items-center gap-1.5">
      {id && (
        <button onClick={watch} disabled={watched} className="btn btn-ghost btn-sm">
          {watched ? <IconCheck width={14} height={14} /> : <IconTarget width={14} height={14} />}
          {watched ? "Watching" : "Watch"}
        </button>
      )}
      {id && (
        <button onClick={copy} className="btn btn-ghost btn-sm">
          {copied ? "Copied" : "Copy link"}
        </button>
      )}
      <button onClick={download} className="btn btn-ghost btn-sm">JSON</button>
    </div>
  );
}

function MetaStat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <div
        className="serif num-tight text-[1.5rem] leading-none"
        style={{ fontWeight: 500, color: good ? "var(--color-sage)" : "var(--color-ink)" }}
      >
        {value}
      </div>
      <div className="overline mt-1.5">{label}</div>
    </div>
  );
}

/* ---------------- claims ---------------- */

function ClaimsSection({ report }: { report: AuditReport }) {
  return (
    <section className="card p-6 sm:p-7">
      <SectionHead icon={<IconScale width={16} height={16} />} title="Central claims" count={report.claims.length} />
      <div className="mt-5 space-y-4">
        {report.claims.map((claim) => {
          const v = report.verdicts.find((v) => v.claimId === claim.id);
          if (!v) return null;
          return <ClaimCard key={claim.id} claim={claim} verdict={v} report={report} />;
        })}
      </div>
    </section>
  );
}

function ClaimCard({ claim, verdict, report }: { claim: Claim; verdict: Verdict; report: AuditReport }) {
  const b = BAND[verdict.band];
  const refById = (id: string) => report.retrieved.find((r) => r.id === id);
  const meta = isMetaClaim(claim.text);
  // For meta claims the score means "does the paper say this," not "is it real,"
  // so neutralize the colour to avoid a misleading green chip on a bad paper.
  const scoreColor = meta ? "var(--color-slate)" : b.color;
  return (
    <div className="rounded-2xl border border-line p-5" style={{ background: "var(--color-paper)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-[0.7rem] text-faint">{claim.id}</span>
            {claim.isCentral && <span className="pill pill-neutral">central</span>}
            <span className="pill pill-neutral">{claim.type}</span>
            {meta && (
              <span className="pill pill-slate" title="This claim describes the paper itself, not a testable finding about the world.">
                describes the paper
              </span>
            )}
          </div>
          <p className="serif mt-2 text-[1.08rem] leading-snug text-ink" style={{ fontWeight: 500 }}>
            {claim.text}
          </p>
        </div>
        {meta ? (
          <span className="pill pill-slate shrink-0">meta</span>
        ) : (
          <BandPill band={verdict.band} />
        )}
      </div>

      {meta && (
        <p className="mt-2 text-[0.8rem] italic text-muted">
          Assessed as a statement about the paper, not a reproducible finding. The score reflects
          whether the paper asserts this, not whether it is true.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <LikelihoodBar value={verdict.replicationLikelihood} uncertainty={verdict.uncertainty} band={meta ? "abstained" : verdict.band} />
        <span className="mono shrink-0 text-sm" style={{ color: scoreColor, minWidth: 62, textAlign: "right" }}>
          {verdict.abstain ? "abstain" : `${pct(verdict.replicationLikelihood)}`}
        </span>
      </div>

      <p className="mt-4 text-[0.9rem] leading-relaxed text-ink-2">{verdict.reasoning}</p>

      {verdict.topReasons.length > 0 && (
        <ul className="mt-4 space-y-2">
          {verdict.topReasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[0.86rem]">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: r.direction === "undermines" ? "var(--color-brick)" : r.direction === "supports" ? "var(--color-sage)" : "var(--color-faint)" }}
              />
              <span className="text-ink-2">
                {r.text}
                {r.refId && refById(r.refId) && (
                  <a
                    href={refById(r.refId)!.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center gap-0.5 align-baseline text-clay"
                    style={{ color: "var(--color-clay-ink)" }}
                  >
                    <IconExternal width={12} height={12} />
                  </a>
                )}
                {r.locus && (
                  <span className="ml-1.5 mono text-[0.72rem] text-faint">
                    {r.locus.section} p.{r.locus.page}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- checks ---------------- */

function ChecksSection({ checks, evidence }: { checks: CheckResult[]; evidence: Evidence[] }) {
  const informative = checks.filter((c) => c.status !== "na");
  // Checks that couldn't be evaluated from the ingested text (e.g. abstract-only).
  // Shown as context, never counted for or against the paper.
  const notAssessable = checks.filter((c) => c.status === "na");
  const ordered = [...informative].sort(
    (a, b) =>
      rankStatus(a.status) - rankStatus(b.status) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const fails = informative.filter((c) => c.status === "fail").length;
  const warns = informative.filter((c) => c.status === "warn").length;
  const passes = informative.filter((c) => c.status === "pass").length;
  const total = Math.max(1, informative.length);
  return (
    <section className="card p-6 sm:p-7">
      <SectionHead icon={<IconActivity width={16} height={16} />} title="Deterministic checks" count={informative.length} />
      <p className="mt-2 text-[0.85rem] text-muted">
        Run in code, not by a model. Every recomputation is exact and reproducible.
      </p>

      {informative.length > 0 && (
        <div className="mt-4">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-paper-3)" }}>
            {fails > 0 && <div style={{ width: `${(fails / total) * 100}%`, background: "var(--color-brick)" }} />}
            {warns > 0 && <div style={{ width: `${(warns / total) * 100}%`, background: "var(--color-amber)" }} />}
            {passes > 0 && <div style={{ width: `${(passes / total) * 100}%`, background: "var(--color-sage)" }} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[0.75rem]">
            <OutcomeCount n={fails} label="fail" color="var(--color-brick)" />
            <OutcomeCount n={warns} label="warn" color="var(--color-amber)" />
            <OutcomeCount n={passes} label="pass" color="var(--color-sage)" />
          </div>
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {ordered.map((c) => (
          <CheckRow key={c.id} check={c} evidence={evidence} />
        ))}
      </div>

      {notAssessable.length > 0 && (
        <div className="mt-4 rounded-xl border border-line px-4 py-3" style={{ background: "var(--color-paper-2)" }}>
          <div className="flex items-center gap-2">
            <IconMinus width={13} height={13} style={{ color: "var(--color-faint)" }} />
            <span className="overline">Not assessable from the supplied text</span>
          </div>
          <p className="mt-1.5 text-[0.8rem] leading-snug text-muted">
            {notAssessable.map((c) => c.label.replace(/^Design · /, "")).join(", ")}. These were
            neither reported nor ruled out in the text that was ingested (often only the abstract),
            so they are shown for transparency and do not count for or against the paper.
          </p>
        </div>
      )}
    </section>
  );
}

function OutcomeCount({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ opacity: n === 0 ? 0.45 : 1 }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="mono text-ink">{n}</span>
      <span className="text-faint">{label}</span>
    </span>
  );
}

function rankStatus(s: CheckResult["status"]) {
  return s === "fail" ? 0 : s === "warn" ? 1 : 2;
}

function CheckRow({ check, evidence }: { check: CheckResult; evidence: Evidence[] }) {
  const [open, setOpen] = useState(check.status === "fail");
  const s = STATUS[check.status];
  const ev = check.evidenceId ? evidence.find((e) => e.id === check.evidenceId) : undefined;
  return (
    <div
      id={check.evidenceId ? `chk-${check.evidenceId}` : undefined}
      className="scroll-mt-24 rounded-xl border border-line"
      style={{ background: "var(--color-card)" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: s.color, color: "#fff" }}
        >
          {statusIcon(check.status, 13)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[0.9rem] font-medium text-ink">{check.label}</span>
            {check.severity !== "info" && (
              <span className={`pill ${s.pill}`} style={{ fontSize: "0.65rem", padding: "0.1rem 0.45rem" }}>
                {severityLabel(check.severity)}
              </span>
            )}
          </div>
          {check.recomputation && (
            <p className="mono mt-0.5 truncate text-[0.74rem] text-muted">{check.recomputation}</p>
          )}
        </div>
        <IconChevron
          width={16}
          height={16}
          style={{ color: "var(--color-faint)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}
        />
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3.5">
          <p className="text-[0.86rem] leading-relaxed text-ink-2">{check.detail}</p>
          {check.recomputation && (
            <div
              className="mono mt-3 rounded-lg px-3 py-2 text-[0.76rem] text-ink-2"
              style={{ background: "var(--color-paper-2)" }}
            >
              {check.recomputation}
            </div>
          )}
          {check.implication && (
            <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: "var(--color-paper-2)" }}>
              <IconTarget width={13} height={13} style={{ color: "var(--color-clay-ink)", marginTop: 3, flexShrink: 0 }} />
              <p className="text-[0.82rem] leading-snug text-muted">
                <span className="font-medium text-ink-2">Why this matters. </span>
                {check.implication}
              </p>
            </div>
          )}
          {ev && (
            <button
              onClick={() => jumpTo(`src-${ev.id}`)}
              className="mt-3 flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--color-paper-3)]"
              style={{ background: "var(--color-paper-2)" }}
              title="Highlight this in the source"
            >
              <IconQuote width={13} height={13} style={{ color: "var(--color-clay-ink)", marginTop: 3, flexShrink: 0 }} />
              <p className="text-[0.82rem] leading-snug text-muted">
                <span className="mono text-[0.68rem] text-faint">
                  {ev.locus.section}
                  {ev.locus.page ? ` · p.${ev.locus.page}` : ""}{" "}
                </span>
                <span className="italic">&ldquo;{ev.locus.quote}&rdquo;</span>
              </p>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- literature ---------------- */

function LiteratureSection({ report }: { report: AuditReport }) {
  if (report.retrieved.length === 0) return null;
  const order: RetrievedWork["stance"][] = ["failed_replication", "contradicts", "supports", "neutral"];
  const sorted = [...report.retrieved].sort((a, b) => order.indexOf(a.stance) - order.indexOf(b.stance));
  return (
    <section className="card p-6 sm:p-7">
      <SectionHead icon={<IconScale width={16} height={16} />} title="What the literature says" count={report.retrieved.length} />
      <div className="mt-5 space-y-3">
        {sorted.map((r) => (
          <RefCard key={r.id} work={r} />
        ))}
      </div>
    </section>
  );
}

const STANCE: Record<RetrievedWork["stance"], { label: string; pill: string; color: string }> = {
  failed_replication: { label: "Failed replication", pill: "pill-brick", color: "var(--color-brick)" },
  contradicts: { label: "Contradicts", pill: "pill-amber", color: "var(--color-amber)" },
  supports: { label: "Supports", pill: "pill-sage", color: "var(--color-sage)" },
  neutral: { label: "Neutral", pill: "pill-neutral", color: "var(--color-faint)" },
};

function RefCard({ work }: { work: RetrievedWork }) {
  const st = STANCE[work.stance];
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <span className={`pill ${st.pill}`}>{st.label}</span>
        <div className="flex items-center gap-2">
          {work.independent && <span className="pill pill-neutral">independent</span>}
          {work.citedByCount != null && (
            <span className="mono text-[0.7rem] text-faint">{work.citedByCount.toLocaleString()} cites</span>
          )}
        </div>
      </div>
      <a
        href={work.url ?? (work.doi ? `https://doi.org/${work.doi}` : "#")}
        target="_blank"
        rel="noopener noreferrer"
        className="group mt-2.5 block"
      >
        <p className="text-[0.92rem] font-medium leading-snug text-ink group-hover:text-clay-ink">
          {work.title}
        </p>
      </a>
      <p className="mt-1 text-xs text-faint">
        {work.authors.slice(0, 3).join(", ")}
        {work.authors.length > 3 ? " et al." : ""} · {work.venue} · {work.year}
      </p>
      <p className="mt-2.5 text-[0.83rem] leading-relaxed text-muted">{work.rationale}</p>
    </div>
  );
}

/* ---------------- live retrieval ---------------- */

function LiveRetrievalSection({ report }: { report: AuditReport }) {
  const lr = report.liveRetrieval?.[0];
  if (!lr || lr.count === 0) return null;
  return (
    <section className="card p-6 sm:p-7">
      <SectionHead icon={<IconScale width={16} height={16} />} title="Live corpus" count={lr.count} />
      <p className="mt-2 text-[0.85rem] text-muted">
        <span className="mono text-ink">{lr.count}</span> unique works surfaced live for{" "}
        <span className="italic">&ldquo;{lr.query}&rdquo;</span>, merged across scholarly sources.
      </p>
      {lr.perSource && Object.keys(lr.perSource).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(lr.perSource).map(([src, n]) => (
            <span key={src} className="pill pill-neutral" style={{ fontSize: "0.66rem" }}>
              {src} <span className="mono text-faint">{n}</span>
            </span>
          ))}
        </div>
      )}
      <ul className="mt-4 space-y-2.5">
        {lr.sample.map((w, i) => (
          <li key={i} className="text-[0.83rem]">
            <a
              href={w.url ?? (w.doi ? `https://doi.org/${w.doi}` : "#")}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-2 hover:text-clay-ink"
            >
              {w.title}
            </a>{" "}
            <span className="text-faint">
              · {w.year ?? "n.d."}
              {w.citedByCount != null ? ` · ${w.citedByCount.toLocaleString()} cites` : ""}
              {w.sources && w.sources.length > 1 ? ` · ${w.sources.length} sources` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- verification ---------------- */

function VerificationSection({ report }: { report: AuditReport }) {
  const v = report.verifications ?? [];
  if (v.length === 0) return null;
  return (
    <section className="card p-6 sm:p-7">
      <SectionHead icon={<IconShield width={16} height={16} />} title="Adversarial verification" count={v.length} />
      <p className="mt-2 text-[0.85rem] text-muted">
        Every high-severity finding faces independent refuters. It survives only by majority.
      </p>
      <div className="mt-4 space-y-2.5">
        {v.map((rec) => (
          <div key={rec.checkId} className="flex items-start gap-3 rounded-xl border border-line p-3.5">
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={{ background: rec.survived ? "var(--color-sage)" : "var(--color-brick)", color: "#fff" }}
            >
              {rec.survived ? <IconShield width={13} height={13} /> : <IconX width={13} height={13} />}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[0.86rem] font-medium text-ink">{rec.label}</span>
                <span className="mono text-[0.7rem] text-faint">
                  {rec.refuters - rec.votesToRefute}/{rec.refuters} upheld
                </span>
              </div>
              <p className="mt-1 text-[0.82rem] leading-snug text-muted">{rec.note}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- trust footer ---------------- */

function TrustFooter({ report }: { report: AuditReport }) {
  const o = report.overall;
  const m = report.manifest;
  return (
    <section className="rounded-2xl border border-line p-5" style={{ background: "var(--color-paper-2)" }}>
      <div className="flex items-center gap-2">
        <IconShield width={15} height={15} style={{ color: "var(--color-sage)" }} />
        <span className="overline">Trust ledger &amp; provenance</span>
      </div>
      <dl className="mt-3 space-y-2 text-[0.83rem]">
        <Row k="Grounding rate" v={pct(o.groundingRate)} />
        <Row k="Reasons dropped as ungrounded" v={String(report.droppedReasons ?? 0)} />
        <Row k="Adjudicator" v={o.modelUsed} />
        <Row k="Claims assessed" v={String(m?.claimsAssessed ?? report.verdicts.filter((v) => !v.abstain).length)} />
        <Row k="Sources queried" v={String(m?.sourceCount ?? o.sourceCount ?? "—")} />
        <Row k="Engine version" v={report.meta.engineVersion} />
        {m?.fingerprint && <Row k="Engine fingerprint" v={m.fingerprint} />}
        {m?.contentHash && <Row k="Content hash" v={m.contentHash} />}
        <Row k="Generated" v={new Date(report.meta.generatedAt).toLocaleString()} />
      </dl>
      {m?.citation && <CiteButton citation={m.citation} />}
    </section>
  );
}

function CiteButton({ citation }: { citation: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="mt-4 rounded-xl border border-line p-3" style={{ background: "var(--color-card)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="overline">Cite this audit</span>
        <button onClick={copy} className="btn btn-ghost btn-sm">
          {copied ? <IconCheck width={13} height={13} /> : <IconQuote width={13} height={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-[0.76rem] leading-snug text-muted">{citation}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="mono text-right text-ink-2">{v}</dd>
    </div>
  );
}

/* ---------------- shared ---------------- */

function SectionHead({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: "var(--color-paper-2)", color: "var(--color-clay-ink)" }}
      >
        {icon}
      </span>
      <h3 className="serif text-lg text-ink" style={{ fontWeight: 500 }}>
        {title}
      </h3>
      {count != null && <span className="mono text-xs text-faint">{count}</span>}
    </div>
  );
}
