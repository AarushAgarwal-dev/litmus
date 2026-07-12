import type { Metadata } from "next";
import { computeBenchmark } from "@/lib/demo/benchmark";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/primitives";
import { ReliabilityChart, BarCompare, AblationChart } from "@/components/charts";
import { IconTarget, IconActivity, IconLayers, IconShield } from "@/components/icons";
import { BAND } from "@/lib/ui";
import realResults from "@/lib/eval/real-results.json";

type RealCase = {
  doi: string;
  label: string;
  cls: "retracted" | "failed-replication" | "robust";
  outcome: 0 | 1;
  likelihood: number | null;
  band: string | null;
  hard?: boolean;
};

type CI = { lo: number; hi: number } | null | undefined;
type RealMetrics = {
  n: number;
  positives: number;
  negatives: number;
  auc: number | null;
  brier: number | null;
  ece: number;
  prAt50: { accuracy: number | null; precision: number | null; recall: number | null };
  byClass: Record<string, { n: number; meanLikelihood: number | null }>;
  ci?: { auc?: CI; brier?: CI; ece?: CI };
  stability?: { checked: number; agreement: number | null } | null;
};

export const metadata: Metadata = {
  title: "Benchmark, Litmus",
  description:
    "Does 70% mean 70%? Discrimination (ROC-AUC), calibration (reliability, ECE, Brier), the ablation ladder, and per-field calibration, computed on labeled replication outcomes.",
};

export default function BenchmarkPage() {
  const r = computeBenchmark();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <Reveal>
        <Eyebrow>The benchmark</Eyebrow>
        <h1 className="display mt-3 text-ink" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
          Does 70% actually mean 70%?
        </h1>
        <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-muted">
          A prediction is only useful if it&rsquo;s honest about its own
          uncertainty. We run the full auditor over a held-out labeled set and
          measure two things independently: can it <em>tell replicated from
          failed</em> (discrimination), and do its probabilities <em>mean what
          they say</em> (calibration). The numbers below are computed live from
          the harness, not asserted.
        </p>
      </Reveal>

      {/* REAL labeled slice — lead with this */}
      <RealCasesSection />

      {/* ---- calibration harness (synthetic) ---- */}
      <Reveal>
        <div className="mt-16 border-t border-line pt-10">
          <Eyebrow>Calibration harness</Eyebrow>
          <h2 className="serif mt-3 text-ink" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 500 }}>
            Validating the calibration math at scale
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted">
            The real slice above proves discrimination on real outcomes but is small. To validate
            the <em>calibration</em> machinery (isotonic fit, per-field curves, reliability, ECE) at
            statistical scale, we run a synthetic set whose per-field base rates are drawn from the
            published replication literature. It is a harness for the math, not a claim about real
            papers, and is clearly labeled as such.
          </p>
        </div>
      </Reveal>

      {/* headline metrics */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="ROC-AUC" value={r.auc.toFixed(2)} sub="replicated vs failed" tone="clay" />
        <Metric label="PR-AUC" value={r.prauc.toFixed(2)} sub="precision–recall" />
        <Metric label="Brier score" value={r.brierCal.toFixed(3)} sub={`from ${r.brierRaw.toFixed(3)} raw`} tone="sage" />
        <Metric label="Calibration error (ECE)" value={r.eceCal.toFixed(3)} sub={`from ${r.eceRaw.toFixed(3)} raw`} tone="sage" />
      </div>

      {/* reliability + ablation */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <Panel icon={<IconTarget width={16} height={16} />} title="Calibration" subtitle="Reliability diagram on held-out papers">
            <ReliabilityChart raw={r.reliabilityRaw} cal={r.reliabilityCal} />
            <p className="mt-4 text-[0.86rem] leading-relaxed text-muted">
              Raw model scores are over-confident (they sit off the diagonal).
              Fitting isotonic calibration on the labeled training split pulls
              them onto it, ECE drops from{" "}
              <span className="mono text-ink">{r.eceRaw.toFixed(3)}</span> to{" "}
              <span className="mono" style={{ color: "var(--color-sage)" }}>{r.eceCal.toFixed(3)}</span>.
              Because isotonic is monotone, discrimination (AUC) is unchanged, calibration is a free win on top of it.
            </p>
          </Panel>
        </Reveal>

        <Reveal delay={80}>
          <Panel icon={<IconLayers width={16} height={16} />} title="Ablation" subtitle="Each component earns its place">
            <AblationChart rungs={r.ablation} />
            <p className="mt-4 text-[0.86rem] leading-relaxed text-muted">
              Discrimination climbs as we add signals: deterministic checks
              alone, then retrieved literature, then adjudication, then
              adversarial verification. Each rung is calibrated on train and
              scored on the same held-out set, nothing is arbitrary.
            </p>
          </Panel>
        </Reveal>
      </div>

      {/* baselines + per-field */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <Panel icon={<IconActivity width={16} height={16} />} title="Against the baselines" subtitle="Discrimination (ROC-AUC)">
            <BarCompare
              max={1}
              items={r.baselines.map((b) => ({
                label: b.name,
                value: b.auc ?? r.auc,
                highlight: b.auc == null,
                note: b.note,
              }))}
            />
          </Panel>
        </Reveal>

        <Reveal delay={80}>
          <Panel icon={<IconTarget width={16} height={16} />} title="Per-field calibration" subtitle="Base rates differ by field, so we calibrate by field">
            <div className="overflow-x-auto">
              <table className="w-full text-[0.85rem]">
                <thead>
                  <tr className="border-b border-line text-left">
                    <Th>Field</Th>
                    <Th right>Base rate</Th>
                    <Th right>AUC</Th>
                    <Th right>ECE</Th>
                    <Th right>n</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.byField.map((f) => (
                    <tr key={f.field} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-2 text-ink-2 capitalize">{f.field}</td>
                      <td className="py-2.5 pl-2 text-right mono text-muted">{Math.round(f.baseRate * 100)}%</td>
                      <td className="py-2.5 pl-2 text-right mono text-ink">{f.auc.toFixed(2)}</td>
                      <td className="py-2.5 pl-2 text-right mono" style={{ color: "var(--color-sage)" }}>{f.ece.toFixed(3)}</td>
                      <td className="py-2.5 pl-2 text-right mono text-faint">{f.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[0.82rem] leading-relaxed text-muted">
              A single global calibration would lie: psychology replicates at
              ~39%, economics at ~61%. One curve per field keeps the
              probabilities honest everywhere.
            </p>
          </Panel>
        </Reveal>
      </div>

      {/* methodology note */}
      <Reveal>
        <div className="mt-8 rounded-2xl border border-line p-6" style={{ background: "var(--color-paper-2)" }}>
          <span className="overline">Methodology &amp; honesty</span>
          <p className="mt-3 max-w-3xl text-[0.9rem] leading-relaxed text-ink-2">
            Two evals, kept separate on purpose. The <strong>real slice</strong> at the top runs the
            full production pipeline on real papers with externally-sourced outcomes (Retraction
            Watch, Registered Replication Reports, Nobel/Turing-recognized foundational work); it is
            the honest test of discrimination, and it is deliberately small. The{" "}
            <strong>synthetic harness</strong> here uses a labeled set of{" "}
            <span className="mono">{r.n}</span> papers (per-field base rates from the published
            replication literature), split 50/50; the calibrator is fit on train and every metric is
            computed on held-out test by the same code that powers the product. It validates the
            calibration math at scale, not real-paper performance. Next step: extend the real slice
            toward the full corpora (RP:CB, RP:P, DARPA SCORE) with the identical harness. The bar to
            beat: published ML replication predictors reach ~0.68 AUC and degrade out-of-sample.
          </p>
        </div>
      </Reveal>
    </div>
  );
}

const CLASS_META: Record<RealCase["cls"], { label: string; color: string }> = {
  retracted: { label: "Retracted for cause", color: "var(--color-brick)" },
  "failed-replication": { label: "Failed replication", color: "var(--color-amber)" },
  robust: { label: "Robust / replicated", color: "var(--color-sage)" },
};

function ciStr(ci?: { lo: number; hi: number } | null): string {
  return ci ? ` (${ci.lo.toFixed(2)}–${ci.hi.toFixed(2)})` : "";
}

// A degenerate bootstrap CI (lo == hi == 1) means zero misclassifications: honest
// to say so rather than show a fake-tight interval that reads as overconfident.
function aucSub(ci: { lo: number; hi: number } | null | undefined, n: number): string {
  if (ci && ci.lo === ci.hi) return `no misclassifications on this curated set (n=${n})`;
  return `95% CI${ciStr(ci) || " n/a"}`;
}

function RealCasesSection() {
  const m = realResults.metrics as unknown as RealMetrics;
  const cases = (realResults.cases as RealCase[]).filter((c) => c.likelihood != null);
  const order: RealCase["cls"][] = ["retracted", "failed-replication", "robust"];
  const sorted = [...cases].sort(
    (a, b) => order.indexOf(a.cls) - order.indexOf(b.cls) || (a.likelihood ?? 0) - (b.likelihood ?? 0),
  );
  const meanPct = (cls: RealCase["cls"]) => {
    const v = m.byClass[cls]?.meanLikelihood;
    return v == null ? null : Math.round(v * 100);
  };
  const nHard = cases.filter((c) => c.hard).length;
  const stab = m.stability;
  return (
    <Reveal>
      <div className="mt-10 rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--color-clay-line)", background: "var(--color-clay-wash)" }}>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--color-card)", color: "var(--color-clay-ink)" }}>
            <IconShield width={16} height={16} />
          </span>
          <div>
            <h2 className="serif text-xl leading-none text-ink" style={{ fontWeight: 500 }}>
              Real papers, real outcomes
            </h2>
            <p className="mt-1 text-xs text-faint">
              Sanity-check floor on {m.n} externally-labeled papers ({nHard} harder / contested), full pipeline, live
            </p>
          </div>
        </div>

        {/* graded separation — lead with this, not a single AUC number */}
        <div className="mt-6 rounded-xl border border-line p-5" style={{ background: "var(--color-card)" }}>
          <span className="overline">Graded separation</span>
          <p className="mt-1 text-[0.82rem] text-muted">
            The clearest signal: mean Litmus likelihood climbs monotonically with real reproducibility.
          </p>
          <div className="mt-4 space-y-3">
            {order.map((cls) => {
              const v = meanPct(cls);
              return (
                <div key={cls} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-[0.82rem] text-ink-2">{CLASS_META[cls].label}</span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-paper-3)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${v ?? 0}%`, background: CLASS_META[cls].color }} />
                  </span>
                  <span className="mono w-12 shrink-0 text-right text-[0.9rem]" style={{ color: CLASS_META[cls].color }}>
                    {v == null ? "—" : `${v}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* secondary metrics, each with a bootstrap 95% CI */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="ROC-AUC"
            value={m.auc != null ? `${m.auc.toFixed(2)}` : "—"}
            sub={aucSub(m.ci?.auc, m.n)}
            tone="clay"
          />
          <Metric label="Accuracy @ 50%" value={m.prAt50.accuracy != null ? `${Math.round(m.prAt50.accuracy * 100)}%` : "—"} sub={`${m.positives} robust / ${m.negatives} not`} />
          <Metric label="Brier" value={m.brier != null ? m.brier.toFixed(3) : "—"} sub={`95% CI${ciStr(m.ci?.brier) || " n/a"}`} tone="sage" />
          <Metric
            label="Run-to-run stability"
            value={stab?.agreement != null ? `${Math.round(stab.agreement * 100)}%` : "—"}
            sub={stab?.checked ? `${stab.checked} re-audited, same band` : "band agreement"}
          />
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-line" style={{ background: "var(--color-card)" }}>
          <table className="w-full text-[0.84rem]">
            <thead>
              <tr className="border-b border-line text-left">
                <Th>Paper</Th>
                <Th>Class</Th>
                <Th right>Litmus</Th>
                <Th right>Correct</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const band = (c.band && BAND[c.band as keyof typeof BAND]) || BAND.mixed;
                const predRobust = (c.likelihood ?? 0) >= 0.5;
                const correct = predRobust === (c.outcome === 1);
                return (
                  <tr key={c.doi} className="border-b border-line last:border-0">
                    <td className="py-2.5 pl-4 pr-2 text-ink-2">
                      <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener noreferrer" className="hover:text-clay-ink">
                        {c.label}
                      </a>
                      {c.hard && (
                        <span className="ml-2 rounded px-1.5 py-0.5 text-[0.62rem] uppercase tracking-wide" style={{ background: "var(--color-paper-3)", color: "var(--color-muted)" }}>
                          harder
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: CLASS_META[c.cls].color }} />
                        <span className="text-[0.78rem] text-muted">{CLASS_META[c.cls].label}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right mono" style={{ color: band.color }}>
                      {Math.round((c.likelihood ?? 0) * 100)}%
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right">
                      <span style={{ color: correct ? "var(--color-sage)" : "var(--color-brick)" }}>{correct ? "✓" : "✗"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[0.82rem] leading-relaxed text-muted">
          Every row is a live audit reproducible from its DOI. This is a sanity-check <em>floor</em> on
          clear-cut and harder/contested cases, not proof the engine is perfect on genuinely ambiguous
          papers; the AUC carries a wide confidence interval at this sample size and the honest next
          step is to widen the slice toward the full corpora. Retraction detection legitimately
          contributes on the retracted rows. Check mark threshold is 50%.
        </p>
      </div>
    </Reveal>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "clay" | "sage" }) {
  const color = tone === "clay" ? "var(--color-clay-ink)" : tone === "sage" ? "var(--color-sage)" : "var(--color-ink)";
  return (
    <div className="card-quiet p-5">
      <div className="serif num-tight" style={{ fontSize: "2.2rem", fontWeight: 500, color, lineHeight: 1 }}>
        {value}
      </div>
      <div className="mt-2 text-[0.9rem] font-medium text-ink-2">{label}</div>
      <div className="mt-0.5 text-[0.78rem] text-faint">{sub}</div>
    </div>
  );
}

function Panel({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="card h-full p-6 sm:p-7">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--color-paper-2)", color: "var(--color-clay-ink)" }}>
          {icon}
        </span>
        <div>
          <h3 className="serif text-lg leading-none text-ink" style={{ fontWeight: 500 }}>
            {title}
          </h3>
          <p className="mt-1 text-xs text-faint">{subtitle}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`pb-2 overline ${right ? "text-right pl-2" : "pr-2"}`} style={{ fontWeight: 560 }}>
      {children}
    </th>
  );
}
