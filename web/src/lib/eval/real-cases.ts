/**
 * eval/real-cases.ts — a real, labeled evaluation slice.
 *
 * Unlike the synthetic calibration harness (demo/benchmark.ts), these are real
 * published papers with a known, externally-sourced ground truth: retracted for
 * cause, robustly replicated, or a documented failed replication. Litmus is run
 * on each through the identical production pipeline; the numbers on the
 * benchmark page's "Real cases" tab come from those runs, not from simulation.
 *
 * Outcome convention (binary, for ROC-AUC): 1 = expected to hold up
 * (robust/replicated), 0 = expected not to (retracted-for-cause or failed
 * replication). Each row cites WHY it is labeled the way it is, so the eval is
 * auditable end to end.
 */

export type RealOutcome = 0 | 1;
export type RealClass = "retracted" | "failed-replication" | "robust";

export interface RealCase {
  doi: string;
  label: string; // human-readable case name
  cls: RealClass;
  outcome: RealOutcome;
  source: string; // where the ground-truth label comes from
  /** Harder/contested case: less famous, or a still-debated replication outcome. */
  hard?: boolean;
}

export const REAL_CASES: RealCase[] = [
  /* ---- retracted for cause (outcome 0) ---- */
  {
    doi: "10.1016/S0140-6736(97)11096-0",
    label: "Wakefield et al. — MMR and autism",
    cls: "retracted",
    outcome: 0,
    source: "The Lancet retraction (2010); GMC misconduct findings; Retraction Watch",
  },
  {
    doi: "10.1126/science.1256151",
    label: "LaCour & Green — canvassing and attitude change",
    cls: "retracted",
    outcome: 0,
    source: "Science retraction (2015); data shown to be fabricated",
  },
  {
    doi: "10.1016/S0140-6736(20)31180-6",
    label: "Mehra et al. — hydroxychloroquine (Surgisphere)",
    cls: "retracted",
    outcome: 0,
    source: "The Lancet retraction (2020); unverifiable Surgisphere data",
  },
  {
    doi: "10.1056/NEJMoa2007621",
    label: "Mehra et al. — cardiovascular disease & COVID (Surgisphere)",
    cls: "retracted",
    outcome: 0,
    source: "NEJM retraction (2020); unverifiable Surgisphere data",
  },
  {
    doi: "10.1038/nature12968",
    label: "Obokata et al. — STAP cells (article)",
    cls: "retracted",
    outcome: 0,
    source: "Nature retraction (2014); RIKEN misconduct investigation",
  },
  {
    doi: "10.1038/nature12969",
    label: "Obokata et al. — STAP cells (letter)",
    cls: "retracted",
    outcome: 0,
    source: "Nature retraction (2014); RIKEN misconduct investigation",
  },
  {
    doi: "10.1126/science.1094515",
    label: "Hwang et al. — patient-specific stem cells",
    cls: "retracted",
    outcome: 0,
    source: "Science retraction (2006); fabrication",
  },

  /* ---- documented failed replications (outcome 0) ---- */
  {
    doi: "10.1037/0022-3514.74.5.1252",
    label: "Baumeister et al. — ego depletion",
    cls: "failed-replication",
    outcome: 0,
    source: "Hagger et al. (2016) Registered Replication Report: null",
  },
  {
    doi: "10.1177/0956797610383437",
    label: "Carney, Cuddy & Yap — power posing",
    cls: "failed-replication",
    outcome: 0,
    source: "Ranehill et al. (2015); Simmons & Simonsohn (2017): hormonal/behavioral effects not replicated",
  },
  {
    doi: "10.1037/a0021524",
    label: "Bem — feeling the future (precognition)",
    cls: "failed-replication",
    outcome: 0,
    source: "Galak et al. (2012); Ritchie et al. (2012): failed to replicate",
  },
  {
    doi: "10.1037/0022-3514.71.2.230",
    label: "Bargh, Chen & Burrows — elderly priming",
    cls: "failed-replication",
    outcome: 0,
    source: "Doyen et al. (2012): elderly-priming walking-speed effect not replicated",
  },
  {
    doi: "10.1126/science.1130726",
    label: "Zhong & Liljenquist — cleanliness / Macbeth effect",
    cls: "failed-replication",
    outcome: 0,
    source: "Gámez et al. / Earp et al. (2014): failed to replicate",
  },

  /* ---- robustly replicated / foundational (outcome 1) ---- */
  {
    doi: "10.1126/science.1225829",
    label: "Jinek et al. — CRISPR-Cas9 programmable cleavage",
    cls: "robust",
    outcome: 1,
    source: "Foundational, extensively reproduced; 2020 Nobel Prize in Chemistry",
  },
  {
    doi: "10.1016/j.cell.2006.07.024",
    label: "Takahashi & Yamanaka — induced pluripotent stem cells",
    cls: "robust",
    outcome: 1,
    source: "Foundational, extensively reproduced; 2012 Nobel Prize in Medicine",
  },
  {
    doi: "10.1103/PhysRevLett.116.061102",
    label: "Abbott et al. (LIGO) — gravitational waves (GW150914)",
    cls: "robust",
    outcome: 1,
    source: "Independently confirmed detections; 2017 Nobel Prize in Physics",
  },
  {
    doi: "10.1038/nature14539",
    label: "LeCun, Bengio & Hinton — deep learning",
    cls: "robust",
    outcome: 1,
    source: "Foundational review; methods reproduced across the field; 2018 Turing Award",
  },
  {
    doi: "10.1038/s41586-020-2649-2",
    label: "Harris et al. — array programming with NumPy",
    cls: "robust",
    outcome: 1,
    source: "Describes a widely-used, independently-verified software substrate",
  },
  {
    doi: "10.7554/eLife.50342",
    label: "Lyashenko et al. — receptor-based relative sensing",
    cls: "robust",
    outcome: 1,
    source: "Peer-reviewed eLife, model + experiment, preprint on record, consistent literature",
  },

  /* ---- harder / contested cases (less famous or still debated) ---- */
  {
    doi: "10.1016/j.cell.2009.03.017",
    label: "Scholl et al. — STK33 / KRAS synthetic lethality",
    cls: "failed-replication",
    outcome: 0,
    source: "Babij et al. (2011): STK33 not required for KRAS-mutant cell viability; failed to replicate",
    hard: true,
  },
  {
    doi: "10.1111/j.1467-9280.2008.02227.x",
    label: "Schnall, Benton & Harvey — cleanliness and moral judgment",
    cls: "failed-replication",
    outcome: 0,
    source: "Johnson, Cheung & Donnellan (2014): cleanliness-priming effect not replicated",
    hard: true,
  },
  {
    doi: "10.1037/0022-3514.54.5.768",
    label: "Strack, Martin & Stepper — facial feedback",
    cls: "failed-replication",
    outcome: 0,
    source: "Wagenmakers et al. (2016) Registered Replication Report: null (effect remains contested)",
    hard: true,
  },
  {
    doi: "10.1126/science.1132491",
    label: "Vohs, Mead & Goode — the psychological consequences of money",
    cls: "failed-replication",
    outcome: 0,
    source: "Multi-lab money-priming replications (e.g., Rohrer, Pashler & Harris 2015): null",
    hard: true,
  },
  {
    doi: "10.1126/science.185.4157.1124",
    label: "Tversky & Kahneman — judgment under uncertainty (anchoring)",
    cls: "robust",
    outcome: 1,
    source: "Anchoring replicates robustly (Many Labs 1; Klein et al. 2014)",
    hard: true,
  },
  {
    doi: "10.2307/1914185",
    label: "Kahneman & Tversky — prospect theory",
    cls: "robust",
    outcome: 1,
    source: "Foundational, extensively reproduced; 2002 Nobel Prize in Economics",
    hard: true,
  },
];
