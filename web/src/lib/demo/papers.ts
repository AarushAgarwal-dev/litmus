/**
 * demo/papers.ts, illustrative audit cases.
 *
 * These are synthetic papers, but the numbers are real: the reported statistics
 * are crafted so the deterministic checkers genuinely fire (or genuinely pass)
 * when the live pipeline runs over them. The curated references are real,
 * verifiable works (the pipeline confirms them live against OpenAlex) with
 * stances represented accurately.
 *
 * Four cases: a fragile cancer study, a psychology paper with impossible
 * descriptives, a solid randomized trial, and a genuinely mixed case that
 * triggers abstention on a thin claim.
 */

import type {
  Claim,
  Evidence,
  DesignAttributes,
  PaperMeta,
  RetrievedWork,
} from "../types";

export interface DemoPaper {
  meta: PaperMeta;
  narrative: string; // abstract-like intro text, part of the source
  methods: string; // a methods-section sentence, the anchor for design findings
  claims: Claim[];
  evidence: Evidence[];
  design: DesignAttributes;
  curated: RetrievedWork[];
  topicQuery: string; // used for the live OpenAlex retrieval panel
  typicalD?: number;
  expectedBand: string; // for the demo picker
  tagline: string;
}

/** Assemble the source text the grounding guard verifies against. */
export function buildSourceText(p: DemoPaper): string {
  const parts = [p.narrative, p.methods];
  for (const c of p.claims) parts.push(c.text);
  for (const e of p.evidence) parts.push(e.locus.quote);
  return parts.join("\n\n");
}

/** The methods locus used to anchor design-rigor findings. */
export function methodsLocus(p: DemoPaper) {
  return { section: "Methods", page: 2, quote: p.methods };
}

/* ================================================================== */
/* A, Fragile cancer preclinical study                                */
/* ================================================================== */

const CANCER: DemoPaper = {
  meta: {
    id: "stk33-synthetic-lethal",
    title:
      "Silencing the kinase STK33 is selectively lethal in KRAS-mutant colorectal tumours",
    authors: ["R. Malken", "T. Osei", "L. Barranco", "J. Whitfield"],
    year: 2016,
    venue: "Journal of Oncogenic Signalling",
    field: "cancer preclinical",
    abstractText:
      "We report that STK33 is a selective synthetic-lethal vulnerability in KRAS-mutant colorectal cancer.",
    labelOutcome: "failed",
    labelSource: "Illustrative case (target-class non-replication pattern)",
  },
  narrative:
    "KRAS is the most frequently mutated oncogene in colorectal cancer and remains largely undruggable. " +
    "Here we identify the serine/threonine kinase STK33 as a selective synthetic-lethal partner of mutant KRAS. " +
    "Using RNA interference across a panel of cell lines and a xenograft model, we show that STK33 depletion collapses viability specifically in KRAS-mutant backgrounds.",
  methods:
    "Cell lines were assayed in duplicate; xenograft experiments used four animals per group. Investigators were not blinded to genotype, allocation was not randomised, and no correction for multiple comparisons was applied. The study was not pre-registered and data were not deposited.",
  claims: [
    {
      id: "c1",
      text:
        "STK33 knockdown selectively reduces viability of KRAS-mutant tumour cells but not KRAS-wild-type cells.",
      type: "causal",
      isCentral: true,
      evidenceIds: ["e1", "e2"],
      loci: [{ section: "Results", page: 4, quote: "STK33 knockdown selectively reduces viability of KRAS-mutant tumour cells but not KRAS-wild-type cells." }],
    },
    {
      id: "c2",
      text: "STK33 knockdown reduces tumour growth in vivo in KRAS-mutant xenografts.",
      type: "causal",
      isCentral: true,
      evidenceIds: ["e3"],
      loci: [{ section: "Results", page: 6, quote: "STK33 knockdown reduces tumour growth in vivo in KRAS-mutant xenografts." }],
    },
  ],
  evidence: [
    {
      id: "e1",
      kind: "stat",
      text: "Viability was lower in KRAS-mutant lines after STK33 knockdown.",
      stat: {
        test: "t",
        value: 1.9,
        df1: 12,
        reportedPText: ".008",
        comparator: "=",
      },
      locus: {
        section: "Results",
        page: 4,
        quote:
          "Viability of KRAS-mutant lines was significantly reduced relative to controls (t(12) = 1.9, p = .008).",
      },
    },
    {
      id: "e2",
      kind: "stat",
      text: "Selectivity index differed between mutant and wild-type panels.",
      stat: {
        test: "F",
        value: 9.0,
        df1: 1,
        df2: 10,
        reportedPText: ".013",
        comparator: "=",
      },
      locus: {
        section: "Results",
        page: 5,
        quote:
          "The selectivity index differed by genotype (F(1, 10) = 9.0, p = .013).",
      },
    },
    {
      id: "e3",
      kind: "stat",
      text: "Xenograft tumour volume was reduced with STK33 knockdown.",
      stat: {
        test: "t",
        value: 2.6,
        df1: 6,
        reportedPText: ".04",
        comparator: "=",
        effect: { kind: "d", value: 1.84 },
      },
      locus: {
        section: "Results",
        page: 6,
        quote:
          "Tumour volume was reduced in the knockdown arm (n = 4 per group; t(6) = 2.6, p = .04).",
      },
    },
  ],
  design: {
    sampleSize: 8,
    perGroupN: 4,
    biologicalReplicates: 2,
    blinding: false,
    randomization: null,
    controls: true,
    multipleComparisonCorrection: false,
    preregistration: false,
    dataAvailable: false,
    codeAvailable: false,
  },
  curated: [
    {
      id: "W-begley-ellis",
      doi: "10.1038/483531a",
      title: "Drug development: Raise standards for preclinical cancer research",
      authors: ["C. G. Begley", "L. M. Ellis"],
      year: 2012,
      venue: "Nature",
      stance: "contradicts",
      independent: true,
      weight: 0.5,
      rationale:
        "Documents that only 6 of 53 landmark preclinical cancer findings could be reproduced, the base-rate context this single-lab, small-n result sits inside.",
      claimId: "c1",
    },
    {
      id: "W-rpcb",
      doi: "10.7554/eLife.71601",
      title:
        "Investigating the replicability of preclinical cancer biology",
      authors: ["T. M. Errington", "M. Mathur", "C. K. Soderberg"],
      year: 2021,
      venue: "eLife",
      stance: "contradicts",
      independent: true,
      weight: 0.5,
      rationale:
        "The Reproducibility Project: Cancer Biology found preclinical effects replicated at a fraction of the original magnitude; synthetic-lethal RNAi screens of this era were a notable failure class.",
      claimId: "c1",
    },
    {
      id: "W-stk33-context",
      doi: "10.1158/0008-5472.CAN-10-3684",
      title: "STK33 kinase is not essential in KRAS-dependent cancer cells",
      authors: ["T. Babij", "et al."],
      year: 2011,
      venue: "Cancer Research",
      stance: "contradicts",
      independent: true,
      weight: 0.6,
      rationale:
        "An independent group reported that STK33 kinase activity is dispensable in KRAS-mutant lines, contradicting the proposed selective-lethality mechanism.",
      claimId: "c1",
    },
  ],
  topicQuery: "STK33 KRAS synthetic lethal cancer cell viability",
  typicalD: 0.4,
  expectedBand: "fragile",
  tagline: "Small n, a p-value that flips, and an independent failure to replicate.",
};

/* ================================================================== */
/* B, Psychology paper with impossible descriptives                   */
/* ================================================================== */

const PSYCH: DemoPaper = {
  meta: {
    id: "ego-depletion-ethics",
    title: "Ego depletion increases unethical behaviour: a laboratory study",
    authors: ["D. Farr", "M. Kessler", "S. Ito"],
    year: 2014,
    venue: "Journal of Experimental Social Behaviour",
    field: "social psychology",
    abstractText:
      "Depleting self-control resources increased subsequent unethical behaviour across three studies.",
    labelOutcome: "failed",
    labelSource: "Illustrative case (impossible-statistics pattern)",
  },
  narrative:
    "Self-control is theorised to draw on a limited resource that, once depleted, leaves people less able to resist temptation. " +
    "Across three laboratory studies using 7-point self-report scales, we test whether ego depletion increases unethical behaviour.",
  methods:
    "Participants were randomly assigned to condition and completed integer-response scales. No correction for multiple comparisons was applied across the three studies, the analyses were not pre-registered, and the raw data were not made available.",
  claims: [
    {
      id: "c1",
      text: "Ego-depleted participants report more unethical intentions than controls.",
      type: "causal",
      isCentral: true,
      evidenceIds: ["e1", "e2", "d1", "d2"],
      loci: [{ section: "Results", page: 3, quote: "Ego-depleted participants report more unethical intentions than controls." }],
    },
    {
      id: "c2",
      text: "The effect of depletion on unethical behaviour is large and robust.",
      type: "descriptive",
      isCentral: true,
      evidenceIds: ["e3", "d3"],
      loci: [{ section: "Discussion", page: 8, quote: "The effect of depletion on unethical behaviour is large and robust." }],
    },
  ],
  evidence: [
    {
      id: "d1",
      kind: "descriptive",
      text: "Depletion condition mean on the unethical-intentions scale.",
      descriptive: {
        label: "Depletion condition (unethical intentions)",
        mean: 5.19,
        meanText: "5.19",
        sd: 1.34,
        sdText: "1.34",
        n: 28,
        items: 1,
        scaleMin: 1,
        scaleMax: 7,
        integer: true,
      },
      locus: {
        section: "Results",
        page: 3,
        quote:
          "Participants in the depletion condition (n = 28) reported higher unethical intentions (M = 5.19, SD = 1.34).",
      },
    },
    {
      id: "d2",
      kind: "descriptive",
      text: "Control condition mean and SD.",
      descriptive: {
        label: "Control condition (unethical intentions)",
        mean: 3.48,
        meanText: "3.48",
        sd: 0.3,
        sdText: "0.30",
        n: 21,
        items: 1,
        scaleMin: 1,
        scaleMax: 7,
        integer: true,
      },
      locus: {
        section: "Results",
        page: 3,
        quote:
          "Control participants (n = 21) scored lower and more tightly clustered (M = 3.48, SD = 0.30).",
      },
    },
    {
      id: "d3",
      kind: "descriptive",
      text: "Study 3 behavioural measure.",
      descriptive: {
        label: "Study 3 cheating count",
        mean: 4.0,
        meanText: "4.00",
        sd: 2.1,
        sdText: "2.10",
        n: 15,
        items: 1,
        scaleMin: 1,
        scaleMax: 5,
        integer: true,
      },
      locus: {
        section: "Results",
        page: 6,
        quote:
          "In Study 3 the depletion group cheated more often (M = 4.00, SD = 2.10, n = 15, 1–5 scale).",
      },
    },
    {
      id: "e1",
      kind: "stat",
      text: "Study 1 t-test.",
      stat: { test: "t", value: 2.05, df1: 47, reportedPText: ".045", comparator: "=" },
      locus: {
        section: "Results",
        page: 3,
        quote: "The depletion effect was significant in Study 1, t(47) = 2.05, p = .045.",
      },
    },
    {
      id: "e2",
      kind: "stat",
      text: "Study 2 t-test.",
      stat: { test: "t", value: 2.03, df1: 38, reportedPText: ".048", comparator: "=" },
      locus: {
        section: "Results",
        page: 5,
        quote: "The effect replicated in Study 2, t(38) = 2.03, p = .048.",
      },
    },
    {
      id: "e3",
      kind: "stat",
      text: "Study 3 t-test.",
      stat: { test: "t", value: 2.06, df1: 29, reportedPText: ".043", comparator: "=" },
      locus: {
        section: "Results",
        page: 6,
        quote: "Study 3 confirmed the pattern, t(29) = 2.06, p = .043.",
      },
    },
  ],
  design: {
    perGroupN: 24,
    blinding: null,
    randomization: true,
    controls: true,
    multipleComparisonCorrection: false,
    preregistration: false,
    dataAvailable: false,
    codeAvailable: false,
  },
  curated: [
    {
      id: "W-hagger-rrr",
      doi: "10.1177/1745691616652873",
      title:
        "A Multilab Preregistered Replication of the Ego-Depletion Effect",
      authors: ["M. S. Hagger", "N. L. D. Chatzisarantis", "et al."],
      year: 2016,
      venue: "Perspectives on Psychological Science",
      stance: "failed_replication",
      independent: true,
      weight: 0.92,
      rationale:
        "A 23-lab preregistered replication found the ego-depletion effect indistinguishable from zero, the definitive failed replication of this literature.",
      claimId: "c1",
    },
  ],
  topicQuery: "ego depletion self-control unethical behaviour replication",
  typicalD: 0.3,
  expectedBand: "unsupported",
  tagline: "Reported means and SDs that no integer data can produce.",
};

/* ================================================================== */
/* C, Solid randomized trial                                          */
/* ================================================================== */

const SOLID: DemoPaper = {
  meta: {
    id: "pcsk9-ldl-rct",
    title:
      "A monoclonal antibody against PCSK9 lowers LDL cholesterol: a randomized, double-blind, placebo-controlled trial",
    authors: ["A. Reyes", "P. Novak", "K. Sundaram", "E. Whitmore"],
    year: 2018,
    venue: "Journal of Cardiovascular Medicine",
    field: "clinical biomedical",
    abstractText:
      "A fully human anti-PCSK9 monoclonal antibody reduced LDL cholesterol by ~60% versus placebo in a randomized, double-blind trial.",
    labelOutcome: "replicated",
    labelSource: "Illustrative case (well-replicated drug class)",
  },
  narrative:
    "PCSK9 promotes degradation of the LDL receptor; inhibiting it should lower circulating LDL cholesterol. " +
    "In a preregistered, randomized, double-blind, placebo-controlled trial (n = 602), we evaluate a fully human anti-PCSK9 monoclonal antibody.",
  methods:
    "Participants were randomised 1:1 to antibody or placebo under double-blind conditions against a placebo control. The primary and secondary endpoints were pre-registered, multiplicity was controlled with a hierarchical testing procedure, and de-identified participant data were deposited.",
  claims: [
    {
      id: "c1",
      text: "Anti-PCSK9 antibody reduces LDL cholesterol relative to placebo.",
      type: "causal",
      isCentral: true,
      evidenceIds: ["e1"],
      loci: [{ section: "Results", page: 5, quote: "Anti-PCSK9 antibody reduces LDL cholesterol relative to placebo." }],
    },
  ],
  evidence: [
    {
      id: "e1",
      kind: "stat",
      text: "Primary endpoint: LDL-C reduction vs placebo.",
      stat: { test: "t", value: 12.4, df1: 600, reportedPText: "< .001", comparator: "<" },
      locus: {
        section: "Results",
        page: 5,
        quote:
          "The treatment arm showed a large reduction in LDL-C versus placebo (t(600) = 12.4, p < .001).",
      },
    },
    {
      id: "e2",
      kind: "stat",
      text: "Secondary endpoint: apolipoprotein B.",
      stat: { test: "t", value: 8.1, df1: 600, reportedPText: "< .001", comparator: "<" },
      locus: {
        section: "Results",
        page: 6,
        quote: "Apolipoprotein B was similarly reduced (t(600) = 8.1, p < .001).",
      },
    },
    {
      id: "e3",
      kind: "stat",
      text: "Prespecified subgroup.",
      stat: { test: "t", value: 5.7, df1: 300, reportedPText: "< .001", comparator: "<" },
      locus: {
        section: "Results",
        page: 6,
        quote: "The effect held in the diabetic subgroup (t(300) = 5.7, p < .001).",
      },
    },
  ],
  design: {
    sampleSize: 602,
    perGroupN: 301,
    blinding: true,
    randomization: true,
    controls: true,
    multipleComparisonCorrection: true,
    preregistration: true,
    dataAvailable: true,
    codeAvailable: false,
  },
  curated: [
    {
      id: "W-fourier",
      doi: "10.1056/NEJMoa1615664",
      title: "Evolocumab and Clinical Outcomes in Patients with Cardiovascular Disease",
      authors: ["M. S. Sabatine", "R. P. Giugliano", "et al."],
      year: 2017,
      venue: "New England Journal of Medicine",
      stance: "supports",
      independent: true,
      weight: 0.9,
      rationale:
        "A 27,564-patient independent outcomes trial confirms that anti-PCSK9 antibodies robustly lower LDL-C and reduce cardiovascular events.",
      claimId: "c1",
    },
    {
      id: "W-odyssey",
      doi: "10.1056/NEJMoa1801174",
      title: "Alirocumab and Cardiovascular Outcomes after Acute Coronary Syndrome",
      authors: ["G. G. Schwartz", "et al."],
      year: 2018,
      venue: "New England Journal of Medicine",
      stance: "supports",
      independent: true,
      weight: 0.85,
      rationale:
        "A second, independently sponsored anti-PCSK9 outcomes trial reproduces the LDL-lowering effect in a separate patient population.",
      claimId: "c1",
    },
  ],
  topicQuery: "PCSK9 inhibitor monoclonal antibody LDL cholesterol randomized trial",
  typicalD: 0.5,
  expectedBand: "robust",
  tagline: "Preregistered, powered, double-blind, and independently replicated twice.",
};

/* ================================================================== */
/* D, Mixed case with an abstention                                   */
/* ================================================================== */

const MIXED: DemoPaper = {
  meta: {
    id: "microbiome-immunotherapy",
    title:
      "Gut microbiome diversity predicts response to anti-PD-1 immunotherapy in melanoma",
    authors: ["N. Achterberg", "R. Palli", "Y. Cho"],
    year: 2019,
    venue: "Journal of Translational Oncology",
    field: "biomedical",
    abstractText:
      "Higher gut microbiome diversity was associated with response to anti-PD-1 therapy in a single-centre melanoma cohort.",
    labelOutcome: "unknown",
    labelSource: "Illustrative case (genuinely mixed literature)",
  },
  narrative:
    "The gut microbiome may shape antitumour immunity. " +
    "In a single-centre cohort of 42 melanoma patients treated with anti-PD-1, we relate baseline microbiome diversity to clinical response, and explore a candidate taxon as a biomarker.",
  methods:
    "This was an observational single-centre cohort with a defined responder control comparison. Multiple candidate taxa were tested without correction for multiple comparisons, the analysis was not pre-registered, and sequencing data and analysis code were deposited.",
  claims: [
    {
      id: "c1",
      text:
        "Higher baseline gut microbiome diversity is associated with response to anti-PD-1 therapy.",
      type: "correlational",
      isCentral: true,
      evidenceIds: ["e1"],
      loci: [{ section: "Results", page: 4, quote: "Higher baseline gut microbiome diversity is associated with response to anti-PD-1 therapy." }],
    },
    {
      id: "c2",
      text:
        "Abundance of Faecalibacterium alone predicts response and can serve as a standalone biomarker.",
      type: "causal",
      isCentral: true,
      evidenceIds: ["e2"],
      loci: [{ section: "Results", page: 5, quote: "Abundance of Faecalibacterium alone predicts response and can serve as a standalone biomarker." }],
    },
  ],
  evidence: [
    {
      id: "e1",
      kind: "stat",
      text: "Diversity correlated with response.",
      stat: { test: "r", value: 0.34, n: 42, reportedPText: ".03", comparator: "=" },
      locus: {
        section: "Results",
        page: 4,
        quote:
          "Baseline Shannon diversity correlated with response (r = .34, n = 42, p = .03).",
      },
    },
    {
      id: "e2",
      kind: "stat",
      text: "Single-taxon association.",
      stat: { test: "r", value: 0.31, n: 42, reportedPText: ".045", comparator: "=" },
      locus: {
        section: "Results",
        page: 5,
        quote:
          "Faecalibacterium abundance alone was associated with response (r = .31, p = .045).",
      },
    },
  ],
  design: {
    sampleSize: 42,
    perGroupN: 21,
    blinding: null,
    randomization: null,
    controls: true,
    multipleComparisonCorrection: false,
    preregistration: false,
    dataAvailable: true,
    codeAvailable: true,
  },
  curated: [
    {
      id: "W-gopalakrishnan",
      doi: "10.1126/science.aan4236",
      title:
        "Gut microbiome modulates response to anti-PD-1 immunotherapy in melanoma patients",
      authors: ["V. Gopalakrishnan", "et al."],
      year: 2018,
      venue: "Science",
      stance: "supports",
      independent: true,
      weight: 0.6,
      rationale:
        "An independent cohort also reports higher diversity in responders, supporting the diversity–response association (claim 1).",
      claimId: "c1",
    },
    {
      id: "W-matson",
      doi: "10.1126/science.aao3290",
      title: "The commensal microbiome is associated with anti-PD-1 efficacy in melanoma",
      authors: ["V. Matson", "et al."],
      year: 2018,
      venue: "Science",
      stance: "contradicts",
      independent: true,
      weight: 0.55,
      rationale:
        "A parallel cohort found the specific responder-associated taxa differed from other studies, cross-cohort taxa do not agree, undercutting any single-taxon biomarker (claim 2).",
      claimId: "c1",
    },
  ],
  topicQuery: "gut microbiome diversity anti-PD-1 immunotherapy melanoma response",
  typicalD: 0.5,
  expectedBand: "mixed",
  tagline: "Real signal on diversity, but a thin single-taxon claim the auditor refuses to score.",
};

export const DEMO_PAPERS: DemoPaper[] = [CANCER, PSYCH, SOLID, MIXED];

export function getDemoPaper(id: string): DemoPaper | undefined {
  return DEMO_PAPERS.find((p) => p.meta.id === id);
}
