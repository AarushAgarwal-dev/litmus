"use client";

import { useEffect, useState } from "react";
import { IconSun, IconMoon } from "./icons";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("litmus-theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle color theme"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-2 text-muted transition-colors hover:text-ink"
      style={{ background: "var(--color-card)" }}
    >
      {theme === "dark" ? <IconSun width={16} height={16} /> : <IconMoon width={16} height={16} />}
    </button>
  );
}
