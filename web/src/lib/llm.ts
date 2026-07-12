/**
 * llm.ts, the single seam to the model.
 *
 * A minimal structural interface (`LLMClient`) lets every Claude-backed step
 * accept an injected client, so the parsing/fallback logic is unit-testable with
 * a mock, no key, no network. In production `defaultClient()` returns the real
 * Anthropic SDK, which satisfies the interface structurally.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface LLMToolUseBlock {
  type: string;
  name?: string;
  input?: unknown;
  text?: string;
}
export interface LLMResponse {
  content: LLMToolUseBlock[];
}
export interface LLMClient {
  messages: {
    create: (args: Record<string, unknown>) => Promise<LLMResponse>;
  };
}

export function hasClaudeKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}


export function defaultClient(): LLMClient {
  // Extra retries + generous timeout so transient 429/529s ride out rather than
  // silently dropping a claim to the deterministic fallback under load.
  return new Anthropic({ maxRetries: 6, timeout: 120_000 }) as unknown as LLMClient;
}

/** Resolve the client to use: explicit (tests) → real Anthropic (if key) → null. */
export function resolveClient(client?: LLMClient): LLMClient | null {
  if (client) return client;
  if (hasClaudeKey()) return defaultClient();
  return null;
}

/** Pull the forced tool-call input out of a response, if present. */
export function toolInput<T = Record<string, unknown>>(res: LLMResponse): T | null {
  const block = res.content?.find((b) => b.type === "tool_use");
  return block && block.input != null ? (block.input as T) : null;
}

/** Enforce the product's no-em-dash rule on any model-generated free text. */
export function stripEmDash(s: string): string {
  return typeof s === "string" ? s.replace(/\s*—\s*/g, ", ") : s;
}

/** Concatenate the text blocks of a plain (non-tool) response. */
export function textOut(res: LLMResponse): string {
  return (res.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
}

export const MODELS = {
  adjudicator: "claude-opus-4-8",
  extractor: "claude-sonnet-5",
  triage: "claude-haiku-4-5-20251001",
} as const;

/**
 * Ensemble of Claude models to adjudicate each claim with; their scores are
 * aggregated for a more robust, more verifiable verdict. Defaults to a single
 * model (no extra cost); set e.g. LITMUS_ENSEMBLE_MODELS="claude-opus-4-8,claude-sonnet-5"
 * to combine models.
 */
export const ENSEMBLE: string[] = (process.env.LITMUS_ENSEMBLE_MODELS || MODELS.adjudicator)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * Token budgets. Generous by default (nothing gets truncated for lack of room);
 * every value is overridable via env for cost control, e.g. LITMUS_TOK_ADJUDICATE.
 */
export const BUDGET = {
  extract: envInt("LITMUS_TOK_EXTRACT", 16000),
  adjudicate: envInt("LITMUS_TOK_ADJUDICATE", 16000),
  stance: envInt("LITMUS_TOK_STANCE", 12000),
  pdf: envInt("LITMUS_TOK_PDF", 16000),
  verify: envInt("LITMUS_TOK_VERIFY", 12000),
  narrative: envInt("LITMUS_TOK_NARRATIVE", 3000),
};

/** Max central claims to adjudicate (each is one model call, run concurrently). */
export const MAX_CLAIMS = envInt("LITMUS_MAX_CLAIMS", 12);
/** Concurrency cap for the parallel adjudication (avoid provider rate limits). */
export const ADJUDICATE_CONCURRENCY = envInt("LITMUS_ADJ_CONCURRENCY", 6);

/** Input-size limits (characters), also env-tunable. */
export const INPUT = {
  paperChars: envInt("LITMUS_IN_PAPER", 400000),
  abstractChars: envInt("LITMUS_IN_ABSTRACT", 3000),
  retrievePerPage: envInt("LITMUS_RETRIEVE", 20),
};

