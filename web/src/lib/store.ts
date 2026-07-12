/**
 * store.ts, durable audit storage (file-backed).
 *
 * Completed reports are written to `.audits/` keyed by a content hash of the
 * input, so every audit gets a stable permalink and `GET /api/audit/{id}` can
 * serve it. In the FULL system this is Postgres + object storage; the interface
 * is the same. Server-only (Node runtime).
 */

import { promises as fs } from "fs";
import path from "path";
import type { AuditReport, WatchlistEntry, AuditSummary } from "./types";
import { hash } from "./ingest/fetch";

const DIR = path.join(process.cwd(), ".audits");
const WATCHLIST = path.join(DIR, "watchlist.json");
// Committed showcase reports, copied into the runtime store on first use so a
// fresh deployment (ephemeral disk) still serves the example permalinks and the
// Recent-audits strip without having to re-run any audits.
const SEED_DIR = path.join(process.cwd(), "seed-audits");
let seeded = false;

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  try {
    await fs.mkdir(DIR, { recursive: true });
    const files = await fs.readdir(SEED_DIR).catch(() => [] as string[]);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const dest = path.join(DIR, f);
      try {
        await fs.access(dest); // already present: never overwrite live audits
      } catch {
        await fs.copyFile(path.join(SEED_DIR, f), dest).catch(() => {});
      }
    }
  } catch {
    /* best-effort seed; never break an audit over it */
  }
}

function summarize(id: string, report: AuditReport): AuditSummary {
  return {
    id,
    title: report.paper.title,
    field: report.overall.field,
    band: report.overall.band,
    likelihood: report.overall.replicationLikelihood,
    generatedAt: report.meta.generatedAt,
    reAuditable: !!(report.meta.input?.doi || report.meta.input?.demoId),
  };
}

export function auditId(input: string): string {
  return hash(input).toString(36) + "-" + (input.length % 1000).toString(36);
}

export async function saveReport(id: string, report: AuditReport): Promise<void> {
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${id}.json`), JSON.stringify(report), "utf8");
  } catch {
    /* best-effort persistence, never break an audit over disk */
  }
}

export async function getReport(id: string): Promise<AuditReport | null> {
  try {
    await ensureSeeded();
    const safe = id.replace(/[^a-z0-9-]/gi, "");
    const raw = await fs.readFile(path.join(DIR, `${safe}.json`), "utf8");
    return JSON.parse(raw) as AuditReport;
  } catch {
    return null;
  }
}

export async function listRecent(limit = 12): Promise<AuditSummary[]> {
  try {
    await ensureSeeded();
    const files = await fs.readdir(DIR);
    const jsons = files.filter((f) => f.endsWith(".json") && f !== "watchlist.json");
    const withStat = await Promise.all(
      jsons.map(async (f) => ({ f, m: (await fs.stat(path.join(DIR, f))).mtimeMs })),
    );
    withStat.sort((a, b) => b.m - a.m);
    const out: AuditSummary[] = [];
    for (const { f } of withStat.slice(0, limit)) {
      try {
        const raw = await fs.readFile(path.join(DIR, f), "utf8");
        out.push(summarize(f.replace(/\.json$/, ""), JSON.parse(raw)));
      } catch {
        /* skip corrupt entries */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/* ---------------- watchlist ---------------- */

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  try {
    const raw = await fs.readFile(WATCHLIST, "utf8");
    const list = JSON.parse(raw) as WatchlistEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeWatchlist(list: WatchlistEntry[]): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(WATCHLIST, JSON.stringify(list, null, 2), "utf8");
}

/** Add (or refresh) a stored audit on the watchlist. Returns the entry, or null. */
export async function addToWatchlist(id: string): Promise<WatchlistEntry | null> {
  const report = await getReport(id);
  if (!report) return null;
  const list = await getWatchlist();
  const now = new Date().toISOString();
  const entry: WatchlistEntry = {
    id,
    title: report.paper.title,
    field: report.overall.field,
    band: report.overall.band,
    likelihood: report.overall.replicationLikelihood,
    doi: report.meta.input?.doi,
    demoId: report.meta.input?.demoId,
    addedAt: now,
    lastAuditedAt: report.meta.generatedAt,
  };
  const existing = list.findIndex((e) => e.id === id || (entry.doi && e.doi === entry.doi));
  if (existing >= 0) list[existing] = { ...list[existing], ...entry, addedAt: list[existing].addedAt };
  else list.unshift(entry);
  await writeWatchlist(list);
  return entry;
}

export async function removeFromWatchlist(id: string): Promise<void> {
  const list = await getWatchlist();
  await writeWatchlist(list.filter((e) => e.id !== id));
}

/** Update a watchlist entry after a re-audit, recording the previous verdict. */
export async function updateWatchlistAfterReaudit(
  oldId: string,
  newReport: AuditReport,
): Promise<WatchlistEntry | null> {
  const list = await getWatchlist();
  const i = list.findIndex((e) => e.id === oldId);
  if (i < 0) return null;
  const prev = list[i];
  const updated: WatchlistEntry = {
    ...prev,
    id: newReport.meta.auditId ?? prev.id,
    band: newReport.overall.band,
    likelihood: newReport.overall.replicationLikelihood,
    lastAuditedAt: newReport.meta.generatedAt,
    previousBand: prev.band,
    previousLikelihood: prev.likelihood,
  };
  list[i] = updated;
  await writeWatchlist(list);
  return updated;
}
