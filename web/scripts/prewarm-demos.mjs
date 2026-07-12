/**
 * scripts/prewarm-demos.mjs — pre-run the showcase audits so they are served
 * from cache (instant /audit/{id} permalinks) during a live demo, instead of a
 * live 10+ source fan-out on camera.
 *
 * Usage:  node scripts/prewarm-demos.mjs [baseUrl]   (via `npm run prewarm`)
 */

const BASE = process.argv[2] || "http://localhost:3000";

// Only real papers are cached (they back the instant example permalinks and the
// Recent-audits strip). Crafted illustrations run live from the Examples tab.
const targets = [
  // Real showcase papers, cached by DOI (deterministic ids back the example permalinks).
  { label: "CRISPR-Cas9 (Jinek 2012) — robust", body: { doi: "10.1126/science.1225829" } },
  { label: "FOURIER / evolocumab (Sabatine 2017) — robust", body: { doi: "10.1056/NEJMoa1615664" } },
  { label: "Wakefield — retracted", body: { doi: "10.1016/S0140-6736(97)11096-0" } },
  { label: "STK33 (Scholl 2009) — fragile", body: { doi: "10.1016/j.cell.2009.03.017" } },
  { label: "iPSC (Yamanaka 2006) — robust", body: { doi: "10.1016/j.cell.2006.07.024" } },
  { label: "Relative sensing (eLife) — robust", body: { doi: "10.7554/eLife.50342" } },
];

async function warm(t) {
  const res = await fetch(`${BASE}/api/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(t.body),
  });
  if (!res.ok || !res.body) return { ...t, error: `HTTP ${res.status}` };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let report = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.type === "done" && ev.report) report = ev.report;
      } catch {
        /* ignore */
      }
    }
  }
  if (!report) return { ...t, error: "no report" };
  return { ...t, id: report.meta.auditId, band: report.overall.band };
}

const results = [];
for (const t of targets) {
  const r = await warm(t);
  results.push(r);
  console.log(
    r.error
      ? `  ✗ ${t.label}: ${r.error}`
      : `  ✓ ${t.label}: ${r.band} -> ${BASE}/audit/${r.id}`,
  );
}
console.log(`\nWarmed ${results.filter((r) => !r.error).length}/${targets.length} audits (served from cache on next view).`);
