import { getWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/watchlist, the watched papers. */
export async function GET() {
  return Response.json({ watchlist: await getWatchlist() });
}

/** POST /api/watchlist { id }, add a stored audit to the watchlist. */
export async function POST(req: Request) {
  let id = "";
  try {
    id = String((await req.json())?.id ?? "");
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const entry = await addToWatchlist(id);
  if (!entry) return Response.json({ error: "Audit not found" }, { status: 404 });
  return Response.json({ entry });
}

/** DELETE /api/watchlist?id=..., stop watching. */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  await removeFromWatchlist(id);
  return Response.json({ ok: true });
}
