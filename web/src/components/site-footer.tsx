import Link from "next/link";
import { LitmusMark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <LitmusMark size={28} />
              <span className="serif text-xl text-ink" style={{ fontWeight: 500 }}>
                Litmus
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              The trust layer for scientific evidence. We tell you which results
              will hold up, before you bet years and millions on them.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterCol
              title="Product"
              links={[
                { href: "/audit", label: "Run an audit" },
                { href: "/method", label: "How it works" },
                { href: "/benchmark", label: "Benchmark" },
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                { href: "/", label: "The Case" },
                { href: "/method#security", label: "Trust & safety" },
              ]}
            />
            <FooterCol
              title="Sources"
              links={[
                { href: "https://openalex.org", label: "OpenAlex" },
                { href: "https://osf.io/e81xl/", label: "Reproducibility Project" },
                { href: "https://www.nature.com/articles/483531a", label: "Begley & Ellis 2012" },
              ]}
              external
            />
          </div>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-center">
          <p>
            Built as a working reference implementation. Demo cases are
            illustrative; the checks, retrieval and calibration are real.
          </p>
          <p className="mono">Litmus engine v0.1.0</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
  external,
}: {
  title: string;
  links: { href: string; label: string }[];
  external?: boolean;
}) {
  return (
    <div>
      <h4 className="overline mb-3">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            {external ? (
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                className="text-sm text-muted transition-colors hover:text-ink"
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
