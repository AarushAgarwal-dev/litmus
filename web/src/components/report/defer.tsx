"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Renders children only once they scroll near the viewport, so a large report
 * (100+ retrieved works, many claims) does not build its entire DOM tree in one
 * synchronous pass. A reserved min-height keeps the scrollbar stable.
 */
export function DeferUntilVisible({
  children,
  minHeight = 220,
}: {
  children: React.ReactNode;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return (
    <div ref={ref} style={{ minHeight: show ? undefined : minHeight }}>
      {show ? children : null}
    </div>
  );
}

/**
 * Isolates a report section: if it throws while rendering, the rest of the
 * report still displays instead of the whole page going blank.
 */
export class SectionBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; label?: string }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // Non-fatal: log for diagnostics, keep the rest of the report alive.
    if (typeof console !== "undefined") console.error("Report section failed:", this.props.label, error);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-xl border border-line p-4 text-sm text-muted" style={{ background: "var(--color-paper-2)" }}>
          This section could not be displayed{this.props.label ? ` (${this.props.label})` : ""}. The rest of the audit is unaffected.
        </div>
      );
    }
    return this.props.children;
  }
}
