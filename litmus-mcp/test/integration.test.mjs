/**
 * Integration test: spin up the MCP server over stdio, call audit_paper with the
 * retracted Wakefield DOI, and assert the verdict is Unsupported with a manifest.
 *
 * Requires a running Litmus instance (LITMUS_URL, default http://localhost:3000)
 * and a prior `npm run build` (spawns dist/index.js). Run: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LITMUS_URL = process.env.LITMUS_URL || "http://localhost:3000";

async function connect() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: { ...process.env, LITMUS_URL },
  });
  const client = new Client({ name: "litmus-mcp-test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

test("exposes the three tools", async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["audit_paper", "check_claim", "get_audit"]);
  } finally {
    await client.close();
  }
});

test("audit_paper on Wakefield DOI => Unsupported + manifest", async () => {
  const client = await connect();
  try {
    const res = await client.callTool(
      { name: "audit_paper", arguments: { doi: "10.1016/S0140-6736(97)11096-0" } },
      undefined,
      { timeout: 300_000 },
    );
    assert.ok(!res.isError, `tool returned error: ${res.content?.[0]?.text}`);
    const out = JSON.parse(res.content[0].text);
    assert.equal(out.verdict, "unsupported", `expected unsupported, got ${out.verdict}`);
    assert.equal(out.retracted, true, "should be flagged retracted");
    assert.ok(out.manifest?.engine_fingerprint, "manifest.engine_fingerprint present");
    assert.ok(out.manifest?.content_hash, "manifest.content_hash present");
    assert.ok(out.permalink?.includes("/audit/"), "permalink present");
    assert.ok(typeof out.summary === "string" && out.summary.length > 0, "summary present");
  } finally {
    await client.close();
  }
});
