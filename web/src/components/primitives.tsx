import type { ReactNode } from "react";
import { BAND, type Band } from "@/lib/ui";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function BandPill({ band }: { band: Band }) {
  const b = BAND[band];
  return (
    <span className={`pill ${b.pill}`}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: b.color }}
      />
      {b.label}
    </span>
  );
}

export function StatTile({
  value,
  label,
  sub,
  source,
  href,
}: {
  value: string;
  label: string;
  sub?: string;
  source?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div
        className="serif num-tight text-ink"
        style={{ fontSize: "clamp(2.2rem, 4vw, 3rem)", fontWeight: 500, lineHeight: 1 }}
      >
        {value}
      </div>
      <div className="mt-3 text-[0.95rem] font-medium leading-snug text-ink-2">{label}</div>
      {sub && <div className="mt-1.5 text-[0.82rem] leading-snug text-muted">{sub}</div>}
      {source && (
        <div className="overline mt-4" style={{ color: "var(--color-faint)" }}>
          {source}
        </div>
      )}
    </>
  );
  const cls = "card-quiet p-6 transition-shadow";
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${cls} block hover:shadow-[var(--shadow-md)]`}
    >
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Radial replication-likelihood gauge with an uncertainty arc. */
export function ScoreDial({
  value,
  uncertainty = 0,
  band,
  size = 176,
  label = "replication likelihood",
}: {
  value: number;
  uncertainty?: number;
  band: Band;
  size?: number;
  label?: string;
}) {
  const stroke = size * 0.075;
  const r = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  const b = BAND[band];
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const val = clamp(value);
  const lo = clamp(value - uncertainty);
  const hi = clamp(value + uncertainty);

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} className="gauge-track" strokeWidth={stroke} />
        {/* uncertainty band */}
        {uncertainty > 0 && band !== "abstained" && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={b.color}
            strokeOpacity={0.22}
            strokeWidth={stroke}
            strokeDasharray={`${C * (hi - lo)} ${C}`}
            strokeDashoffset={-C * lo}
            strokeLinecap="round"
          />
        )}
        {/* value arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={band === "abstained" ? "var(--color-line-3)" : b.color}
          strokeWidth={stroke}
          strokeDasharray={`${C * val} ${C}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {band === "abstained" ? (
          <span className="serif text-2xl text-slate" style={{ color: "var(--color-slate)" }}>, </span>
        ) : (
          <span
            className="serif num-tight text-ink"
            style={{ fontSize: size * 0.26, fontWeight: 500, lineHeight: 1 }}
          >
            {Math.round(val * 100)}
            <span className="text-[0.5em] text-muted">%</span>
          </span>
        )}
        {uncertainty > 0 && band !== "abstained" && (
          <span className="mono mt-0.5 text-[0.62rem] text-faint">
            ±{Math.round(uncertainty * 100)}
          </span>
        )}
      </div>
      {label && (
        <span className="overline mt-3 text-center" style={{ maxWidth: size }}>
          {label}
        </span>
      )}
    </div>
  );
}

/** A slim horizontal likelihood bar with an uncertainty range. */
export function LikelihoodBar({
  value,
  uncertainty = 0,
  band,
}: {
  value: number;
  uncertainty?: number;
  band: Band;
}) {
  const b = BAND[band];
  const lo = Math.max(0, value - uncertainty) * 100;
  const hi = Math.min(1, value + uncertainty) * 100;
  return (
    <div className="relative h-2 w-full rounded-full" style={{ background: "var(--color-paper-3)" }}>
      {band !== "abstained" && (
        <>
          <div
            className="absolute top-0 h-full rounded-full"
            style={{ left: `${lo}%`, width: `${hi - lo}%`, background: b.color, opacity: 0.25 }}
          />
          <div
            className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full"
            style={{ left: `calc(${value * 100}% - 2px)`, background: b.color }}
          />
        </>
      )}
    </div>
  );
}
