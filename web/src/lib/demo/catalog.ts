/** Client-safe picker metadata for the demo cases (no heavy evidence data). */

import type { Band } from "../ui";

export interface CatalogEntry {
  id: string;
  title: string;
  authorsShort: string;
  year: number;
  field: string;
  tagline: string;
  expectedBand: Band;
  /** A real, already-audited paper: the card links to its cached permalink. */
  real?: boolean;
  permalink?: string;
}

export const DEMO_CATALOG: CatalogEntry[] = [
  // Real audits of real papers (cached; open instantly). These are the headline
  // examples: everything here resolves to a real DOI.
  {
    id: "crispr-cas9",
    title: "A programmable dual-RNA–guided DNA endonuclease in adaptive bacterial immunity",
    authorsShort: "Jinek et al.",
    year: 2012,
    field: "molecular biology",
    tagline: "The foundational CRISPR-Cas9 mechanism, extensively reproduced. Robust 93%.",
    expectedBand: "robust",
    real: true,
    permalink: "/audit/1os031w-n",
  },
  {
    id: "fourier-evolocumab",
    title: "Evolocumab and clinical outcomes in patients with cardiovascular disease",
    authorsShort: "Sabatine et al.",
    year: 2017,
    field: "clinical biomedical",
    tagline: "A 27,564-patient double-blind RCT (FOURIER). Robust 80%.",
    expectedBand: "robust",
    real: true,
    permalink: "/audit/1bqkki0-l",
  },
  // Illustrative cases with crafted statistics that deliberately trip the
  // forensic checks. Clearly labeled as illustrations; no DOI.
  {
    id: "stk33-synthetic-lethal",
    title: "STK33 silencing is selectively lethal in KRAS-mutant tumours",
    authorsShort: "Illustration",
    year: 2016,
    field: "cancer preclinical",
    tagline: "Small n, a p-value that flips, and independent evidence against the mechanism.",
    expectedBand: "fragile",
  },
  {
    id: "ego-depletion-ethics",
    title: "Ego depletion increases unethical behaviour",
    authorsShort: "Illustration",
    year: 2014,
    field: "social psychology",
    tagline: "Reported means and SDs that no integer data can produce.",
    expectedBand: "unsupported",
  },
  {
    id: "microbiome-immunotherapy",
    title: "Gut microbiome diversity predicts response to immunotherapy",
    authorsShort: "Illustration",
    year: 2019,
    field: "biomedical",
    tagline: "Real signal on diversity, but a thin claim the auditor refuses to score.",
    expectedBand: "mixed",
  },
];
