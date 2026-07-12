import { listRecent } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/audits?limit=12, recent audits (summaries). */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 12);
  return Response.json({ audits: await listRecent(Math.min(50, Math.max(1, limit))) });
}
