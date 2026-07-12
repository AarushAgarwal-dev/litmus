import type { ReliabilityBin } from "@/lib/calibration";

/* Reliability diagram: predicted probability (x) vs observed frequency (y). */
export function ReliabilityChart({
  raw,
  cal,
}: {
  raw: ReliabilityBin[];
  cal: ReliabilityBin[];
}) {
  const W = 440;
  const H = 360;
  const pad = 44;
  const x = (v: number) => pad + v * (W - 2 * pad);
  const y = (v: number) => H - pad - v * (H - 2 * pad);

  const line = (bins: ReliabilityBin[]) =>
    bins
      .filter((b) => b.count > 0)
      .map((b, i) => `${i === 0 ? "M" : "L"} ${x(b.meanPred).toFixed(1)} ${y(b.fracPos).toFixed(1)}`)
      .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="w-full">
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }} role="img" aria-label="Reliability diagram">
          {/* grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} y1={y(0)} x2={x(t)} y2={y(1)} stroke="var(--color-line)" strokeWidth={1} />
              <line x1={x(0)} y1={y(t)} x2={x(1)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={x(t)} y={y(0) + 18} textAnchor="middle" fontSize={11} fill="var(--color-faint)" className="mono">
                {t}
              </text>
              <text x={x(0) - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-faint)" className="mono">
                {t}
              </text>
            </g>
          ))}
          {/* perfect calibration diagonal */}
          <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--color-line-3)" strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={x(0.72)} y={y(0.82)} fontSize={10} fill="var(--color-faint)" transform={`rotate(-33 ${x(0.72)} ${y(0.82)})`}>
            perfect calibration
          </text>

          {/* raw */}
          <path d={line(raw)} fill="none" stroke="var(--color-slate)" strokeWidth={2} strokeOpacity={0.55} strokeDasharray="5 3" />
          {raw.filter((b) => b.count > 0).map((b, i) => (
            <circle key={i} cx={x(b.meanPred)} cy={y(b.fracPos)} r={3} fill="none" stroke="var(--color-slate)" strokeWidth={1.5} strokeOpacity={0.6} />
          ))}

          {/* calibrated */}
          <path d={line(cal)} fill="none" stroke="var(--color-clay)" strokeWidth={2.5} />
          {cal.filter((b) => b.count > 0).map((b, i) => (
            <circle key={i} cx={x(b.meanPred)} cy={y(b.fracPos)} r={4} fill="var(--color-clay)" />
          ))}

          {/* axis labels */}
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
            predicted replication likelihood
          </text>
          <text x={14} y={H / 2} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)" transform={`rotate(-90 14 ${H / 2})`}>
            observed replication rate
          </text>
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        <LegendDot color="var(--color-clay)" label="Calibrated" />
        <LegendDot color="var(--color-slate)" label="Raw (uncalibrated)" dashed />
        <span className="text-faint">Closer to the diagonal is better.</span>
      </figcaption>
    </figure>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={18} height={8}>
        <line x1={0} y1={4} x2={18} y2={4} stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? "4 2" : undefined} />
      </svg>
      {label}
    </span>
  );
}

/* Horizontal comparison bars (e.g. AUC vs baselines). */
export function BarCompare({
  items,
  max = 1,
  format = (v: number) => v.toFixed(2),
}: {
  items: { label: string; value: number; highlight?: boolean; note?: string }[];
  max?: number;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[0.85rem]" style={{ color: it.highlight ? "var(--color-ink)" : "var(--color-muted)", fontWeight: it.highlight ? 600 : 400 }}>
              {it.label}
            </span>
            <span className="mono text-[0.8rem]" style={{ color: it.highlight ? "var(--color-clay-ink)" : "var(--color-faint)" }}>
              {format(it.value)}
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-paper-3)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${Math.min(100, (it.value / max) * 100)}%`,
                background: it.highlight ? "var(--color-clay)" : "var(--color-line-3)",
              }}
            />
          </div>
          {it.note && <p className="mt-1 text-[0.72rem] text-faint">{it.note}</p>}
        </div>
      ))}
    </div>
  );
}

/* Ablation ladder: AUC rising as components are added. */
export function AblationChart({ rungs }: { rungs: { name: string; auc: number; brier: number }[] }) {
  const W = 460;
  const H = 240;
  const pad = 40;
  const n = rungs.length;
  const bw = (W - 2 * pad) / n;
  const minA = 0.5;
  const maxA = Math.max(...rungs.map((r) => r.auc), 0.9) + 0.02;
  const h = (v: number) => ((v - minA) / (maxA - minA)) * (H - 2 * pad);

  return (
    <figure className="w-full">
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 360 }} role="img" aria-label="Ablation ladder">
          {[0.5, 0.6, 0.7, 0.8, 0.9].map((t) =>
            t <= maxA ? (
              <g key={t}>
                <line x1={pad} y1={H - pad - h(t)} x2={W - pad} y2={H - pad - h(t)} stroke="var(--color-line)" strokeWidth={1} />
                <text x={pad - 8} y={H - pad - h(t) + 4} textAnchor="end" fontSize={10} fill="var(--color-faint)" className="mono">
                  {t.toFixed(1)}
                </text>
              </g>
            ) : null,
          )}
          {rungs.map((r, i) => {
            const bx = pad + i * bw + bw * 0.18;
            const bwid = bw * 0.64;
            const bh = h(r.auc);
            const last = i === n - 1;
            return (
              <g key={r.name}>
                <rect
                  x={bx}
                  y={H - pad - bh}
                  width={bwid}
                  height={bh}
                  rx={4}
                  fill={last ? "var(--color-clay)" : "var(--color-line-3)"}
                />
                <text x={bx + bwid / 2} y={H - pad - bh - 7} textAnchor="middle" fontSize={11} className="mono" fill={last ? "var(--color-clay-ink)" : "var(--color-muted)"}>
                  {r.auc.toFixed(2)}
                </text>
                <text x={bx + bwid / 2} y={H - pad + 15} textAnchor="middle" fontSize={9.5} fill="var(--color-muted)">
                  {r.name.replace("+ ", "+")}
                </text>
              </g>
            );
          })}
          <text x={14} y={H / 2} textAnchor="middle" fontSize={11} fill="var(--color-muted)" transform={`rotate(-90 14 ${H / 2})`}>
            ROC-AUC
          </text>
        </svg>
      </div>
    </figure>
  );
}
