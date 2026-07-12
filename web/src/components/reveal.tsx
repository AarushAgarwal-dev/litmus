"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fade-and-rise on scroll into view. Respects prefers-reduced-motion via CSS. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Above-the-fold content reveals on mount. An IntersectionObserver's initial
    // callback is unreliable for elements already visible at first paint, which
    // left the hero blank until the user scrolled. Anything at or near the top of
    // the document animates in now; only genuinely below-the-fold content waits
    // for scroll. A viewport-height fallback keeps this working even when
    // window.innerHeight reads 0 (some embedded/headless contexts).
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const rect = el.getBoundingClientRect();
    if (rect.top < vh * 0.9 && rect.bottom > 0) {
      // Reveal directly (not via requestAnimationFrame, which can be throttled
      // when the page is not actively painting) so the hero is never left hidden.
      // The 0 -> 1 opacity transition still animates because the hidden state was
      // already painted during hydration.
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as "div";
  return (
    <Comp
      ref={ref as React.Ref<HTMLDivElement>}
      className={`reveal ${shown ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Comp>
  );
}
