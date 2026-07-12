/**
 * litmus.ts — thin client over the Litmus HTTP API + output shaping.
 *
 * The MCP server does not re-implement any audit logic; it calls the same
 * pipeline the app uses (POST /api/audit streams the audit; GET /api/audit/{id}
 * fetches a cached one) and reshapes the report into compact, grounded JSON for
 * an agent to act on. Point it at a running Litmus via LITMUS_URL.
 */

export const BASE = process.env.LITMUS_URL || "http://localhost:3000";

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Run a full audit and return the final report (consumes the NDJSON stream). */
export async function runAudit(
  body: Record<string, string>,
  timeoutMs = 300_000,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Litmus API error ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let report: Record<string, unknown> | null = null;
    let errored: string | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev: { type?: string; report?: Record<string, unknown>; message?: string };
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.type === "done" && ev.report) report = ev.report;
        if (ev.type === "error") errored = ev.message ?? "unknown error";
      }
    }
    if (!report) throw new Error(errored || "Litmus produced no report");
    return report;
  } finally {
    clearTimeout(timer);
  }
}

export async function getAudit(id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/api/audit/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Litmus API error ${res.status}`);
  const j = (await res.json()) as { report?: Record<string, unknown> };
  return j.report ?? null;
}

/** Pull the first DOI out of a URL string, if present. */
export function doiFromUrl(url: string): string | undefined {
  const m = /10\.\d{4,9}\/[^\s"'<>]+/.exec(decodeURIComponent(url));
  return m ? m[0].replace(/[).,;]+$/, "") : undefined;
}

/* ---------------- shaping ---------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function refShape(r: Any) {
  return {
    title: r.title,
    doi: r.doi,
    year: r.year,
    stance: r.stance,
    independent: r.independent,
    rationale: r.rationale,
  };
}

function humanSummary(report: Any): string {
  const o = report.overall;
  const supports = (report.retrieved || []).filter((r: Any) => r.stance === "supports").length;
  const against = (report.retrieved || []).filter(
    (r: Any) => r.stance === "contradicts" || r.stance === "failed_replication",
  ).length;
  const flags = (report.checks || []).filter((c: Any) => c.status === "fail").length;
  const pct = o.band === "abstained" ? "n/a" : `${Math.round(o.replicationLikelihood * 100)}%`;
  const title = String(report.paper?.title ?? "this paper").slice(0, 90);
  return (
    `"${title}": ${o.band}${o.retracted ? " (RETRACTED)" : ""}, ${pct} replication likelihood. ` +
    `${flags} failed check(s), ${supports} supporting / ${against} contradicting works. ` +
    `Not proof; a calibrated, grounded estimate.`
  );
}

export function shapeAudit(report: Any) {
  const o = report.overall;
  const top_flags = (report.checks || [])
    .filter(
      (c: Any) =>
        c.status === "fail" ||
        (c.status === "warn" && (c.severity === "high" || c.severity === "critical")),
    )
    .slice(0, 12)
    .map((c: Any) => ({
      check: c.check,
      label: c.label,
      severity: c.severity,
      detail: c.detail,
      implication: c.implication,
      source_span: c.locus
        ? { section: c.locus.section, page: c.locus.page, quote: c.locus.quote }
        : undefined,
    }));
  const literature = (report.retrieved || [])
    .filter((r: Any) => r.stance !== "neutral")
    .slice(0, 10)
    .map(refShape);
  const m = report.manifest || {};
  const s = report.signals;
  return {
    verdict: o.band,
    replication_likelihood: round(o.replicationLikelihood),
    interval: [round(o.ciLow), round(o.ciHigh)],
    field: o.field,
    retracted: !!o.retracted,
    retraction_reason: o.retractionReason,
    top_flags,
    literature,
    transparency: s
      ? {
          open_access: s.openAccess,
          has_preprint: s.hasPreprint,
          registered_trials: (s.registeredTrials || []).map((t: Any) => t.nctId),
          funders: s.funders,
        }
      : undefined,
    manifest: {
      engine_version: m.engineVersion,
      engine_fingerprint: m.fingerprint,
      adjudicator: m.adjudicator,
      models: m.models,
      content_hash: m.contentHash,
      sources_queried: m.sourceCount,
      generated_at: m.generatedAt,
    },
    audit_id: report.meta?.auditId,
    permalink: report.meta?.auditId ? `${BASE}/audit/${report.meta.auditId}` : undefined,
    summary: humanSummary(report),
  };
}

export function shapeClaim(report: Any) {
  const o = report.overall;
  const v = (report.verdicts || [])[0];
  const like = v ? v.replicationLikelihood : o.replicationLikelihood;
  const supporting_refs = (report.retrieved || [])
    .filter((r: Any) => r.stance === "supports")
    .map(refShape);
  const contradicting_refs = (report.retrieved || [])
    .filter((r: Any) => r.stance === "contradicts" || r.stance === "failed_replication")
    .map(refShape);
  return {
    claim: report.claims?.[0]?.text,
    assessment: o.band,
    replication_likelihood: round(like),
    confidence: v ? round(1 - v.uncertainty) : undefined,
    grounded: (o.groundingRate ?? 0) >= 0.5,
    supporting_refs,
    contradicting_refs,
    reasoning: v?.reasoning,
    manifest: {
      engine_fingerprint: report.manifest?.fingerprint,
      content_hash: report.manifest?.contentHash,
    },
    permalink: report.meta?.auditId ? `${BASE}/audit/${report.meta.auditId}` : undefined,
  };
}
