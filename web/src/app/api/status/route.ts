import { hasClaudeKey } from "@/lib/adjudicate";
import { MODELS } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/status, is the Claude adjudication path active? (No key is exposed.) */
export function GET() {
  return Response.json({
    claude: hasClaudeKey(),
    models: hasClaudeKey() ? MODELS : null,
    engineVersion: "0.2.0",
  });
}
