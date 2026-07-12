import { getReport } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/audit/{id}, fetch a persisted Robustness Report. */
export async function GET(_req: Request, ctx: RouteContext<"/api/audit/[id]">) {
  const { id } = await ctx.params;
  const report = await getReport(id);
  if (!report) return Response.json({ error: "Audit not found" }, { status: 404 });
  return Response.json({ report });
}
