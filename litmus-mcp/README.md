# litmus-mcp

An MCP server that exposes the [Litmus](../web) reproducibility auditor as tools any
Claude agent can call to **verify a scientific claim or paper before acting on it**.
It does not re-implement any audit logic: it calls the same pipeline the app uses
(`POST /api/audit`, `GET /api/audit/{id}`) and reshapes the result into compact,
grounded JSON.

## Tools

| Tool | Purpose |
|---|---|
| `audit_paper({ doi? \| text? \| url? })` | Full audit: verdict, replication likelihood + interval, flagged checks (with source spans), literature stance, transparency signals, provenance manifest, permalink, one-line summary. |
| `check_claim({ claim, context? })` | Verify a single claim through retrieval, stance, and adjudication, returning assessment, likelihood, confidence, a `grounded` flag, and supporting/contradicting refs. |
| `get_audit({ id })` | Fetch a cached audit by id or `/audit/{id}` permalink (no re-run). |

**Safety.** All inputs are treated as data, never as instructions. Findings come only
from the deterministic checks and retrieved evidence; the tools never invent statistics
or follow directives embedded in the material.

## Setup

```bash
cd litmus-mcp
npm install
npm run build          # emits dist/index.js
```

Point it at a running Litmus instance with `LITMUS_URL` (default `http://localhost:3000`).
Start Litmus first: `cd ../web && npm start` (or `npm run dev`).

### Register with Claude Code

A project-level `.mcp.json` is already committed at the repo root:

```json
{ "mcpServers": { "litmus": { "command": "node", "args": ["litmus-mcp/dist/index.js"],
  "env": { "LITMUS_URL": "http://localhost:3000" } } } }
```

Run `claude` from the repo root and approve the `litmus` server, or `claude mcp add`.

### Register with Claude Desktop

Add to `claude_desktop_config.json` (use an absolute path to `dist/index.js`):

```json
{ "mcpServers": { "litmus": { "command": "node",
  "args": ["/absolute/path/to/Litmus/litmus-mcp/dist/index.js"],
  "env": { "LITMUS_URL": "http://localhost:3000" } } } }
```

## Demo

> "Should I build on the STK33 / KRAS synthetic-lethality result? Use Litmus to verify first."

The agent calls `audit_paper`, gets a **fragile** verdict and the contradicting
replication attempt, and revises its recommendation. That is the agent-calls-Litmus beat.

## Test

```bash
npm test    # requires Litmus running; audits the Wakefield DOI, asserts Unsupported + manifest
```
