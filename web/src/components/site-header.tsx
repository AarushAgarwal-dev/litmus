"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "./logo";
import { IconArrowRight } from "./icons";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "The Case" },
  { href: "/method", label: "Method" },
  { href: "/benchmark", label: "Benchmark" },
  { href: "/watchlist", label: "Watchlist" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 transition-[background,border-color,backdrop-filter] duration-300"
      style={{
        background: scrolled ? "color-mix(in srgb, var(--color-paper) 82%, transparent)" : "transparent",
        backdropFilter: scrolled ? "saturate(1.4) blur(10px)" : "none",
        borderBottom: `1px solid ${scrolled ? "var(--color-line)" : "transparent"}`,
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative rounded-full px-3.5 py-2 text-[0.9rem] font-medium transition-colors"
                style={{ color: active ? "var(--color-ink)" : "var(--color-muted)" }}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute inset-x-3 -bottom-px h-px"
                    style={{ background: "var(--color-clay)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/audit" className="btn btn-clay btn-sm">
            Run an audit
            <IconArrowRight width={15} height={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}
