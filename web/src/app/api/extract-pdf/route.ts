export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A guardrail, not a feature limit: the PDF is loaded into memory to parse, so
// an unbounded upload could exhaust it. 40 MB covers essentially every paper and
// stays under Anthropic's PDF request ceiling for the vision path.
const MAX_BYTES = 40 * 1024 * 1024;

/** POST multipart {file} → { text, title } extracted from the PDF. */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "PDF too large (max 40 MB)" }, { status: 413 });
  }
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    if (!merged || merged.trim().length < 40) {
      return Response.json(
        { error: "Could not extract text, the PDF may be scanned images (OCR not enabled)." },
        { status: 422 });
    }
    return Response.json({
      text: merged.slice(0, 200000),
      title: file.name.replace(/\.pdf$/i, ""),
      pages: totalPages,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "PDF parse failed" },
      { status: 422 });
  }
}
