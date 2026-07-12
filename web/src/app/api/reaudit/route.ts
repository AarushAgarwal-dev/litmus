import { runAuditStream } from "@/lib/pipeline";
import {
  getReport,
  saveReport,
  auditId,
  updateWatchlistAfterReaudit,
} from "@/lib/store";
import type { AuditReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reaudit { id }, re-run a stored DOI/example audit against the
 * current literature and report whether the verdict moved (living re-audit).
 */
export async function POST(req: Request) {
  let id = "";
  try {
    id = String((await req.json())?.id ?? "");
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const prev = await getReport(id);
  if (!prev) return Response.json({ error: "Audit not found" }, { status: 404 });

  const input = prev.meta.input;
  if (!input?.doi && !input?.demoId) {
    return Response.json(
      { error: "This audit was run on pasted text and has no live source to re-check." },
      { status: 422 },
    );
  }

  let next: AuditReport | null = null;
  try {
    for await (const ev of runAuditStream(input)) {
      if (ev.type === "done" && ev.report) next = ev.report;
    }
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Re-audit failed" }, { status: 500 });
  }
  if (!next) return Response.json({ error: "Re-audit produced no result" }, { status: 500 });

  const newId = auditId(input.doi || input.demoId || id);
  next.meta.auditId = newId;
  next.meta.input = input;
  await saveReport(newId, next);
  await updateWatchlistAfterReaudit(id, next);

  const dLik = next.overall.replicationLikelihood - prev.overall.replicationLikelihood;
  return Response.json({
    changed: prev.overall.band !== next.overall.band || Math.abs(dLik) >= 0.03,
    previous: { band: prev.overall.band, likelihood: prev.overall.replicationLikelihood, at: prev.meta.generatedAt },
    current: {
      band: next.overall.band,
      likelihood: next.overall.replicationLikelihood,
      at: next.meta.generatedAt,
      auditId: newId,
    },
    delta: dLik,
  });
}
