import Link from "next/link";

/** The Litmus mark, a specimen well whose indicator resolves from paper to clay. */
export function LitmusMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient id="litmus-g" x1="8" y1="30" x2="32" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-paper-3)" />
          <stop offset="0.55" stopColor="var(--color-clay)" />
          <stop offset="1" stopColor="var(--color-clay-ink)" />
        </linearGradient>
      </defs>
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="37"
        rx="11"
        fill="var(--color-card)"
        stroke="var(--color-line-2)"
      />
      {/* the lens / specimen well */}
      <circle cx="20" cy="20" r="11.5" stroke="var(--color-line-3)" strokeWidth="1.4" />
      {/* the indicator: a rising meniscus of clay */}
      <path
        d="M9.2 22.5a11.5 11.5 0 0 0 21.6 0 11.5 11.5 0 0 1-21.6 0Z"
        fill="url(#litmus-g)"
        opacity="0.9"
      />
      <path
        d="M8.9 21.4c3.7 1.9 7.4 1.9 11.1 0s7.4-1.9 11.1 0"
        stroke="var(--color-clay-ink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="20" cy="20" r="2.1" fill="var(--color-ink)" />
    </svg>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 group" aria-label="Litmus home">
      <LitmusMark size={size} />
      <span
        className="serif text-[1.32rem] leading-none tracking-tight text-ink"
        style={{ fontWeight: 500 }}
      >
        Litmus
      </span>
    </Link>
  );
}
