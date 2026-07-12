import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { Eyebrow, StatTile, ScoreDial, BandPill } from "@/components/primitives";
import {
  IconArrowRight,
  IconActivity,
  IconScale,
  IconShield,
  IconTarget,
  IconX,
  IconCheck,
  IconAlert,
  IconArrowUpRight,
} from "@/components/icons";

export default function Home() {
  return (
    <>
      <Hero />
      <Stakes />
      <TheMoment />
      <WhatItDoes />
      <Grounded />
      <Platform />
      <Honesty />
      <ClosingCTA />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="grain pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--color-clay-wash), transparent 68%)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-8 pt-16 sm:px-8 md:pt-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <Reveal>
            <span className="pill pill-clay">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-clay)" }} />
              The trust layer for scientific evidence
            </span>
          </Reveal>
          <Reveal delay={60}>
            <h1
              className="display mt-6 text-ink"
              style={{ fontSize: "clamp(2.6rem, 6vw, 4.4rem)" }}
            >
              We&rsquo;re curing cancer on top of research we can&rsquo;t trust.
            </h1>
          </Reveal>
          <Reveal delay={130}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              When Amgen tried to reproduce 53 landmark cancer studies, only 6
              held up. Litmus reads a paper and tells you which results will
              hold, <span className="text-ink">before you bet ten years and a
              billion dollars on them.</span>
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/audit" className="btn btn-clay">
                Run an audit
                <IconArrowRight width={17} height={17} />
              </Link>
              <Link href="/method" className="btn btn-ghost">
                See the method
              </Link>
            </div>
          </Reveal>
          <Reveal delay={280}>
            <p className="mt-8 text-sm text-faint">
              It starts with cancer. It ends as the verification substrate every
              AI scientist has to run through.
            </p>
          </Reveal>
        </div>

        <Reveal delay={160} className="lg:justify-self-end">
          <SpecimenCard />
        </Reveal>
      </div>
    </section>
  );
}

/** A static, illustrative report card used as the hero visual. */
function SpecimenCard() {
  return (
    <div className="card w-full max-w-sm p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
      <div className="flex items-center justify-between">
        <span className="overline">Robustness report · illustration</span>
        <BandPill band="fragile" />
      </div>
      <p className="serif mt-3 text-lg leading-snug text-ink" style={{ fontWeight: 500 }}>
        STK33 silencing is selectively lethal in KRAS-mutant tumours
      </p>
      <p className="mt-1 text-xs text-faint">J. Oncogenic Signalling · 2016 · preclinical</p>

      <div className="my-5 flex items-center gap-5">
        <ScoreDial value={0.16} uncertainty={0.05} band="fragile" size={132} label="" />
        <ul className="flex-1 space-y-2.5 text-[0.82rem]">
          <FlagRow tone="brick" icon={<IconX width={13} height={13} />} text="p-value recomputes to .082, reported .008" />
          <FlagRow tone="amber" icon={<IconAlert width={13} height={13} />} text="n = 4/group, powered only for d ≥ 1.5" />
          <FlagRow tone="brick" icon={<IconX width={13} height={13} />} text="independent group found the target dispensable" />
        </ul>
      </div>
      <div className="rule" />
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Every flag is clickable to the exact sentence it came from. Nothing the
        auditor can&rsquo;t point to survives.
      </p>
    </div>
  );
}

function FlagRow({ tone, icon, text }: { tone: "brick" | "amber" | "sage"; icon: React.ReactNode; text: string }) {
  const color = tone === "brick" ? "var(--color-brick)" : tone === "amber" ? "var(--color-amber)" : "var(--color-sage)";
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0" style={{ color }}>
        {icon}
      </span>
      <span className="text-ink-2">{text}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function Stakes() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <Reveal>
        <Eyebrow>The most expensive failure mode in the most expensive industry</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-ink" style={{ fontSize: "clamp(1.9rem, 3.6vw, 2.8rem)" }}>
          A $3-trillion enterprise, built on a literature no one verifies.
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { value: "89%", label: "of landmark cancer studies didn't replicate", sub: "6 of 53 reproduced", source: "Begley & Ellis, 2012", href: "https://www.nature.com/articles/483531a" },
          { value: "~$2.6B", label: "average cost to bring one drug to approval", sub: "most of it paying for the failures", source: "DiMasi et al., 2016" },
          { value: "90%", label: "of drugs entering clinical trials fail", sub: "#1 cause: lack of efficacy", source: "Sun et al., 2022", href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9293739/" },
          { value: "~$28B", label: "spent yearly on preclinical research that won't reproduce", sub: "in the US alone", source: "Freedman, 2015", href: "https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002165" },
        ].map((s, i) => (
          <Reveal key={s.value} delay={i * 70}>
            <StatTile {...s} />
          </Reveal>
        ))}
      </div>
      <Reveal delay={120}>
        <p className="mt-8 max-w-2xl text-[0.95rem] leading-relaxed text-muted">
          Read those together: the single most expensive failure mode in the
          most expensive industry on earth is building on results that were
          never true, and today, nothing catches it early.
        </p>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function TheMoment() {
  return (
    <section className="border-y border-line" style={{ background: "var(--color-paper-2)" }}>
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <Eyebrow>Time isn&rsquo;t money. Time is lives.</Eyebrow>
            <h2 className="display mt-4 text-ink" style={{ fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)" }}>
              We find out at the worst possible moment.
            </h2>
            <p className="mt-5 text-[1.02rem] leading-relaxed text-muted">
              A target built on irreproducible biology doesn&rsquo;t fail on day
              one. It fails in Phase II or III, years and hundreds of millions
              later, after patients have waited for a therapy that was never
              going to work.
            </p>
            <p className="mt-4 text-[1.02rem] leading-relaxed text-ink-2">
              Litmus turns a years-later, $100M failure into a day-one triage
              decision: <span className="text-ink">this result is solid, that
              one is standing on sand, verify these three things first.</span>
            </p>
          </Reveal>
          <Reveal delay={120}>
            <Timeline />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Timeline() {
  const rows = [
    { t: "Day 0", label: "Target selection", note: "Cheapest decision to change. Highest leverage in the whole pipeline.", tone: "clay" },
    { t: "Year 2–3", label: "Preclinical validation", note: "The irreproducible result quietly propagates.", tone: "muted" },
    { t: "Year 6", label: "Phase I", note: "Safe, but built on the wrong hypothesis.", tone: "muted" },
    { t: "Year 10+", label: "Phase II/III failure", note: "$100M+ gone. Patients waited a decade for nothing.", tone: "brick" },
  ];
  return (
    <div className="card p-2">
      <ol className="relative">
        {rows.map((r, i) => (
          <li key={r.t} className="relative flex gap-4 px-4 py-4">
            <div className="flex flex-col items-center">
              <span
                className="z-10 h-3 w-3 rounded-full ring-4"
                style={{
                  background: r.tone === "clay" ? "var(--color-clay)" : r.tone === "brick" ? "var(--color-brick)" : "var(--color-line-3)",
                  ["--tw-ring-color" as string]: "var(--color-card)",
                }}
              />
              {i < rows.length - 1 && (
                <span className="w-px flex-1" style={{ background: "var(--color-line-2)" }} />
              )}
            </div>
            <div className="-mt-0.5 pb-1">
              <div className="flex items-baseline gap-2">
                <span className="mono text-xs text-faint">{r.t}</span>
                <span
                  className="text-[0.95rem] font-semibold"
                  style={{ color: r.tone === "brick" ? "var(--color-brick)" : "var(--color-ink)" }}
                >
                  {r.label}
                </span>
              </div>
              <p className="mt-1 text-sm leading-snug text-muted">{r.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WhatItDoes() {
  const pillars = [
    {
      icon: <IconActivity width={22} height={22} />,
      title: "Statistical forensics",
      body: "statcheck, GRIM, GRIMMER, SPRITE, power and p-curve, run in code, never by a model. If a reported number is arithmetically impossible, we prove it.",
    },
    {
      icon: <IconScale width={22} height={22} />,
      title: "The rest of the literature",
      body: "For every central claim we retrieve related work and weigh it, actively hunting the strongest disconfirming evidence, not the confirming kind.",
    },
    {
      icon: <IconShield width={22} height={22} />,
      title: "Grounded, calibrated verdicts",
      body: "A replication likelihood you can trust: every reason points to a source span, calibrated so 70% means 70%, and it abstains when the basis is thin.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <Reveal>
        <Eyebrow>What Litmus does</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-ink" style={{ fontSize: "clamp(1.9rem, 3.6vw, 2.8rem)" }}>
          One trust layer. It reads a paper the way your most sceptical
          colleague would, at scale.
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {pillars.map((p, i) => (
          <Reveal key={p.title} delay={i * 80}>
            <div className="card h-full p-7">
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: "var(--color-clay-wash)", color: "var(--color-clay-ink)" }}
              >
                {p.icon}
              </span>
              <h3 className="serif mt-5 text-xl text-ink" style={{ fontWeight: 500 }}>
                {p.title}
              </h3>
              <p className="mt-2.5 text-[0.92rem] leading-relaxed text-muted">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={120}>
        <div className="mt-6">
          <Link
            href="/method"
            className="inline-flex items-center gap-1.5 text-sm font-medium link-ul"
            style={{ color: "var(--color-clay-ink)" }}
          >
            Walk through the full pipeline
            <IconArrowRight width={15} height={15} />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Grounded() {
  return (
    <section className="border-y border-line" style={{ background: "var(--color-paper-2)" }}>
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <Eyebrow>Nothing ungrounded survives</Eyebrow>
            <h2 className="display mt-4 text-ink" style={{ fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)" }}>
              Every number is clickable to the evidence it came from.
            </h2>
            <p className="mt-5 text-[1.02rem] leading-relaxed text-muted">
              If a flag can&rsquo;t be traced to an exact span in the source or a
              real external paper, Litmus drops it. That single rule is what
              separates an auditor you can defend in a boardroom from a
              confident-sounding guess.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Character-level citations back to the source",
                "The grounding guard doubles as a prompt-injection circuit breaker",
                "Adversarial refuters try to break every high-severity finding",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[0.95rem] text-ink-2">
                  <IconCheck width={18} height={18} style={{ color: "var(--color-sage)", marginTop: 2 }} />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="card p-6">
              <span className="overline">Source · Results, p.4</span>
              <p className="serif mt-3 text-[1.05rem] leading-relaxed text-ink-2">
                &ldquo;Viability of KRAS-mutant lines was significantly reduced
                relative to controls{" "}
                <mark className="evi">(t(12) = 1.9, p = .008).</mark>&rdquo;
              </p>
              <div className="mt-5 rounded-xl border border-line p-4" style={{ background: "var(--color-brick-wash)" }}>
                <div className="flex items-center gap-2">
                  <IconX width={16} height={16} style={{ color: "var(--color-brick)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--color-brick)" }}>
                    statcheck · decision inconsistency
                  </span>
                </div>
                <p className="mono mt-2 text-[0.8rem] text-ink-2">
                  t(12) = 1.9 → p = .082; reported p = .008
                </p>
                <p className="mt-2 text-[0.85rem] leading-snug text-muted">
                  Recomputes to non-significant. The reported value flips the
                  finding.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Platform() {
  const steps = [
    "Cancer preclinical target validation",
    "All preclinical & biomedical research",
    "Pharma R&D, target selection & asset diligence",
    "Evidence-based medicine & guidelines",
    "Funders & publishers, triage & screening",
    "The verification API every AI scientist calls",
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <Eyebrow>Why it&rsquo;s a platform, not a tool</Eyebrow>
          <h2 className="display mt-4 text-ink" style={{ fontSize: "clamp(1.9rem, 3.6vw, 2.8rem)" }}>
            A toll booth on a $3-trillion road.
          </h2>
          <p className="mt-5 text-[1.02rem] leading-relaxed text-muted">
            Litmus doesn&rsquo;t need to capture a trillion dollars. It sits on
            the trust decisions inside the R&amp;D economy and charges a slice of
            the waste it prevents.
          </p>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-ink-2">
            And the timing: the whole world is racing to build AI that reads the
            literature and does science, and none of it knows which literature
            is true. Feed it the unverified corpus and it amplifies the garbage
            at machine speed. The missing piece is a{" "}
            <span className="text-ink">trust layer they can query</span>. A
            credit bureau for scientific claims.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="card overflow-hidden">
            <div className="border-b border-line px-6 py-4">
              <span className="overline">Land &amp; expand</span>
            </div>
            <ol>
              {steps.map((s, i) => (
                <li
                  key={s}
                  className="flex items-center gap-4 border-b border-line px-6 py-3.5 last:border-0"
                  style={{ background: i === 0 ? "var(--color-clay-wash)" : undefined }}
                >
                  <span
                    className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs"
                    style={{
                      background: i === 0 ? "var(--color-clay)" : "var(--color-paper-3)",
                      color: i === 0 ? "#fff" : "var(--color-muted)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-[0.95rem]"
                    style={{ color: i === 0 ? "var(--color-clay-ink)" : "var(--color-ink-2)", fontWeight: i === 0 ? 600 : 400 }}
                  >
                    {s}
                  </span>
                  {i === 0 && <span className="pill pill-clay ml-auto">Beachhead</span>}
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Honesty() {
  return (
    <section className="mx-auto max-w-4xl px-5 pb-4 sm:px-8">
      <Reveal>
        <div
          className="rounded-2xl border p-8"
          style={{ borderColor: "var(--color-line-2)", background: "var(--color-card)" }}
        >
          <div className="flex items-center gap-2.5">
            <IconTarget width={18} height={18} style={{ color: "var(--color-clay-ink)" }} />
            <span className="overline">Credibility guardrail</span>
          </div>
          <p className="serif mt-3 text-lg leading-relaxed text-ink-2">
            The trillion-dollar framing is the arena, not a revenue claim. The
            anchors under it, $28B/yr waste, $2.6B/drug, 90% clinical failure,
            89% non-replication, are all published and cited. A trust company
            that overstates its own numbers is dead on arrival. Ambition,
            grounded.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ClosingCTA() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <Reveal>
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-16 text-center sm:px-16"
          style={{ background: "var(--color-ink)" }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{ background: "radial-gradient(ellipse at 30% -20%, rgba(190,91,62,0.5), transparent 60%)" }}
          />
          <div className="relative">
            <h2
              className="display mx-auto max-w-3xl"
              style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)", color: "var(--color-paper)" }}
            >
              Which papers are real? Find out before you build.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[1.02rem] leading-relaxed" style={{ color: "color-mix(in srgb, var(--color-paper) 74%, transparent)" }}>
              Feed Litmus a known-failed cancer paper and watch it flag the
              math, surface the contradicting literature, and score it low.
              Then feed it a solid one.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/audit" className="btn btn-clay">
                Run an audit
                <IconArrowRight width={17} height={17} />
              </Link>
              <Link
                href="/benchmark"
                className="btn"
                style={{ background: "transparent", color: "var(--color-paper)", border: "1px solid color-mix(in srgb, var(--color-paper) 30%, transparent)" }}
              >
                See the benchmark
                <IconArrowUpRight width={16} height={16} />
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
