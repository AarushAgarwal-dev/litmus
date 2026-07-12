# Litmus

The trust layer for scientific evidence. Litmus reads a scientific paper and tells you how likely its central claims are to hold up, before a lab or a company spends years and millions building on them. It starts with preclinical cancer biology, where roughly 89 percent of landmark studies did not replicate (Amgen reproduced 6 of 53).

This repository is a working reference implementation: a full audit engine, a live web app, an MCP server that lets any AI agent call Litmus as a tool, and a reproducible evaluation harness.

## What is in here

| Path | What it is |
|---|---|
| `web/` | The Litmus app and engine. Next.js 16, React 19, TypeScript, Tailwind v4. The forensic checks, multi-source retrieval, calibration, adjudication, and UI all live here. |
| `litmus-mcp/` | An MCP server that exposes Litmus as tools (`audit_paper`, `check_claim`, `get_audit`) so a Claude agent can verify a claim before acting on it. |
| `.mcp.json` | Project level registration for the MCP server, picked up by Claude Code. |
| `PLAN.md` | The engineering build plan: data model, API contract, security model, evaluation design, and roadmap. |

## How it works

Litmus runs one paper through a streaming pipeline and shows every stage as it happens.

1. Ingest. A DOI is resolved to metadata and open access full text where available, through a chain of independent providers (OpenAlex, Crossref, Europe PMC, Semantic Scholar, and doi.org content negotiation) so no single source being down can fail an audit. You can also paste text or upload a PDF.

2. Extract. A claim graph is built from the paper: the central claims, the reported statistics (test statistic, degrees of freedom, p value, means, standard deviations, sample sizes, effect sizes), and the design attributes. With an API key this uses Claude; without one it uses a transparent heuristic extractor.

3. Forensic checks, run in code and never by a model. statcheck recomputes p values from the reported statistics. GRIM, GRIMMER, and SPRITE test whether reported means and standard deviations are arithmetically possible. Power and sensitivity analysis, a p-curve, and a confidence-interval versus p-value consistency check round out the set. A design review scores randomization, blinding, controls, multiple-comparison correction, and transparency. If a factor cannot be determined from the text that was ingested, it is marked "not assessable" rather than counted against the paper.

4. Retrieve. For each claim Litmus searches many free scholarly corpora in parallel (OpenAlex, Crossref, Semantic Scholar, Europe PMC, PubMed, arXiv, DOAJ, DataCite, OpenAIRE, and CORE when a key is set), then pulls the citation graph (who cited the paper, related work, and independent citation indices) because that is where replications and critiques live. It also resolves transparency signals from the DOI: open access status (Unpaywall), preprint provenance (bioRxiv and medRxiv), registered trials (ClinicalTrials.gov), and declared funders (Crossref). Retraction is detected from both OpenAlex and the Crossref update record, and a retracted paper is capped at the lowest score.

5. Adjudicate. The check results, the retrieved literature, and a corroboration summary are weighed into a per-claim replication likelihood. With a key this is Claude (Opus 4.8), optionally as an ensemble of several models; without one it is a deterministic log-odds model. Either way, confidence is meant to track the strength and one-sidedness of the evidence, not to be spread apart for effect.

6. Calibrate and verify. Raw scores are calibrated per field, with a distribution-free interval around each estimate. A grounding guard drops any reason that cannot be traced to a real span in the source or a real retrieved paper, which doubles as a circuit breaker against instructions hidden in the paper text. High severity findings then face adversarial verification.

7. Report. You get a calibrated verdict (robust, mixed, fragile, unsupported, or an honest abstention), a plain-language executive summary that explains why the verdict landed where it did, every check with a "why this matters" line, the supporting and contradicting literature, and a full provenance manifest with a copyable citation. Completed audits persist at a permalink.

## Quick start

You need Node 20 or newer.

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000, go to `/audit`, and audit a real paper by DOI, by pasting text, or by uploading a PDF. You can also pick one of the built-in examples. The deterministic statistical forensics and the multi-source retrieval run for real with no key.

To turn on the Claude path (multi-claim extraction, adjudication, literature stance classification, and the written summary), copy the example env file and add your key:

```bash
cp .env.local.example .env.local
# then edit .env.local and set ANTHROPIC_API_KEY=...
```

Restart the dev server. A badge on `/audit` and the `/api/status` endpoint show whether the Claude path is active. Your key stays local; `.env.local` is git ignored.

For a production-style run:

```bash
npm run build
npm start
npm run prewarm   # optional: caches the showcase audits so example permalinks load instantly
```

While developing, prefer `npm run dev`. It hot reloads, which avoids serving a stale build if you rebuild while a production server is running.

## The MCP server

`litmus-mcp/` turns Litmus into a verification tool that any Claude agent can call before it acts on a scientific claim.

```bash
cd litmus-mcp
npm install
npm run build
```

Point it at a running Litmus instance with `LITMUS_URL` (default `http://localhost:3000`). The project ships a `.mcp.json` at the repository root, so running Claude Code from the root and approving the `litmus` server is enough. For Claude Desktop, add the server to `claude_desktop_config.json` with an absolute path to `litmus-mcp/dist/index.js`.

It exposes three tools:

- `audit_paper({ doi | text | url })` returns the full verdict, the flagged checks with source spans, the supporting and contradicting literature, the transparency signals, and the provenance manifest.
- `check_claim({ claim, context? })` verifies a single claim through retrieval, stance, and adjudication, with a grounded flag.
- `get_audit({ id })` fetches a cached audit by its permalink id.

All inputs are treated as data, never as instructions, and every finding is grounded in the checks and retrieved evidence. Run `npm test` (with Litmus running) to exercise the server end to end against the retracted Wakefield paper.

## Evaluation and benchmark

The `/benchmark` page leads with a real labeled slice: real papers with externally sourced outcomes (retracted for cause, robustly replicated, or documented failed replications), run through the full production pipeline, with bootstrap confidence intervals and a run-to-run stability measurement. It keeps that separate from a synthetic calibration harness, which exists only to validate the calibration math at scale and is never presented as real-paper accuracy.

```bash
cd web
npm run eval:real    # runs the labeled slice against a running server, writes the results file
npm run eval:gate    # regression gate: fails if discrimination or calibration regress
```

Wire `npm run eval:gate` into CI so a prompt or model change that quietly degrades calibration is blocked before it merges.

## Configuration

Everything is tunable through environment variables, documented in `web/.env.local.example`. The main ones:

- `ANTHROPIC_API_KEY` turns on the Claude path. Without it, the deterministic engine, all forensic checks, and retrieval still run.
- `LITMUS_ENSEMBLE_MODELS` adjudicates each claim with several Claude models and aggregates them.
- `LITMUS_MAX_CLAIMS`, `LITMUS_TOK_*`, and `LITMUS_RETRIEVE` bound cost and depth per audit.
- `CORE_API_KEY` adds the CORE aggregator as a retrieval source.

## What is honest about this build

The forensic checks, calibration, retrieval, grounding guard, and provenance are real and reproducible. Two things are worth stating plainly. First, ingestion today leans on titles and abstracts for many closed-access papers, so for those the verdict rests more on literature corroboration than on recomputing the paper's own numbers; when full text is not available, the report says so. Second, the real labeled evaluation is deliberately small and skewed toward clear cases, which is why it is framed as a sanity-check floor and shown with confidence intervals rather than as a headline accuracy claim. The synthetic 500-paper set is labeled as a calibration harness throughout and is not a claim about real-paper performance.

## Tech

TypeScript throughout. Next.js 16 (App Router, Turbopack) and React 19 for the app, Tailwind v4 for styling, Vitest for the test suite (61 tests), and the Anthropic SDK behind an injectable seam so the whole pipeline is testable with a mock and degrades gracefully when a model call fails.

## License

MIT. See `LICENSE`.
