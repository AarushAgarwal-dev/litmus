import { runAuditStream } from "@/lib/pipeline";
import { auditId, saveReport } from "@/lib/store";
import { finalizeManifest } from "@/lib/provenance";
import { hash } from "@/lib/ingest/fetch";
import type { StageEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/audit
 *   { demoId }, audit a built-in example
 *   { doi }, audit a real paper by DOI (OpenAlex + Europe PMC)
 *   { text, title? }, audit pasted paper text
 *
 * Streams newline-delimited JSON StageEvents. The terminal `done` event carries
 * the full AuditReport, which is also persisted for a permalink.
 */
export async function POST(req: Request) {
  let body: { demoId?: string; doi?: string; text?: string; title?: string; pdfBase64?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { demoId, doi, text, title, pdfBase64 } = body ?? {};
  if (!demoId && !doi && !text) {
    return Response.json({ error: "Provide demoId, doi, or text." }, { status: 400 });
  }

  const canonicalInput = demoId || doi || (text ?? "").slice(0, 400);
  const id = auditId(canonicalInput);
  const contentHash = hash(canonicalInput).toString(16);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const ev of runAuditStream({ demoId, doi, text, title, pdfBase64 })) {
          if (ev.type === "done" && ev.report) {
            ev.report.meta.auditId = id;
            // Record the re-runnable input (DOI/demo only; pasted text is static).
            if (doi) ev.report.meta.input = { doi };
            else if (demoId) ev.report.meta.input = { demoId };
            // Complete the provenance manifest with the content hash + citation.
            finalizeManifest(ev.report, id, contentHash);
            await saveReport(id, ev.report);
          }
          send(ev as StageEvent);
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
