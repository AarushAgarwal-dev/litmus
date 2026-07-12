/**
 * types.ts, the claim-graph schema everything anchors to.
 *
 * Every downstream signal (check, retrieved paper, verdict) points back to a
 * node here, and every node carries a `locus` (a character span in the source)
 * so nothing the auditor says is ungrounded.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type CheckStatus = "fail" | "warn" | "pass" | "na";

/** A character span back into the source document. */
export interface Locus {
  section: string;
  page: number;
  quote: string; // the exact text at this span, for the grounding guard
  charStart?: number;
  charEnd?: number;
}

export type StatTest = "t" | "F" | "chi2" | "r" | "z";
export type Comparator = "=" | "<" | ">" | "<=" | ">=" | "~";

/** A reported statistical result, parsed from the paper. */
export interface StatResult {
  test: StatTest;
  /** test statistic value */
  value: number;
  df1?: number; // t: df; F: numerator; chi2: df
  df2?: number; // F: denominator
  n?: number; // for r
  reportedP?: number;
  reportedPText?: string; // e.g. "0.03" or "< .001", preserves decimals & comparator
  comparator?: Comparator;
  tail?: 1 | 2;
  effect?: { kind: "d" | "r" | "eta2" | "OR" | "HR"; value: number };
}

/** Group-level descriptives, for GRIM / GRIMMER / SPRITE. */
export interface Descriptive {
  label: string;
  mean: number;
  meanText?: string;
  sd?: number;
  sdText?: string;
  n: number;
  items?: number; // # of scale items averaged (GRIM granularity)
  scaleMin?: number;
  scaleMax?: number;
  integer?: boolean; // underlying responses are integers
}

export type EvidenceKind =
  | "stat"
  | "descriptive"
  | "figure"
  | "table"
  | "design"
  | "assertion";

/** A reported effect with a confidence interval, for CI-vs-p consistency. */
export interface IntervalResult {
  effect: string; // e.g. "OR", "d", "b"
  point: number;
  low: number;
  high: number;
  nullValue: number; // 1 for ratios (OR/HR/RR), 0 otherwise
  reportedPText?: string;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  text: string;
  stat?: StatResult;
  descriptive?: Descriptive;
  design?: Partial<DesignAttributes>;
  interval?: IntervalResult;
  locus: Locus;
}

/** Design attributes extracted by the model, scored by code. */
export interface DesignAttributes {
  sampleSize?: number;
  perGroupN?: number;
  biologicalReplicates?: number;
  blinding: boolean | null;
  randomization: boolean | null;
  controls: boolean | null;
  multipleComparisonCorrection: boolean | null;
  preregistration: boolean | null;
  dataAvailable: boolean | null;
  codeAvailable: boolean | null;
  /** Transparency signals sourced externally (Unpaywall / bioRxiv / registries). */
  openAccess?: boolean | null;
  hasPreprint?: boolean | null;
  registeredTrial?: boolean | null;
}

/** External transparency & provenance signals resolved from a DOI. */
export interface PaperSignals {
  openAccess?: boolean;
  oaStatus?: string; // gold / green / hybrid / bronze / closed
  oaUrl?: string;
  hasPreprint?: boolean;
  preprintServer?: string;
  preprintDoi?: string;
  preprintDate?: string;
  publishedDate?: string;
  daysToPublish?: number;
  registeredTrials?: { nctId: string; title: string; status?: string; url: string }[];
  funders?: string[];
}

export type ClaimType = "causal" | "correlational" | "descriptive" | "mechanistic";

export interface Claim {
  id: string;
  text: string;
  type: ClaimType;
  isCentral: boolean;
  evidenceIds: string[];
  loci: Locus[];
}

/** Result of a single deterministic or retrieval-driven check. */
export interface CheckResult {
  id: string;
  check:
    | "statcheck"
    | "grim"
    | "grimmer"
    | "sprite"
    | "power"
    | "pcurve"
    | "design"
    | "reference"
    | "image"
    | "extrinsic";
  label: string;
  status: CheckStatus;
  severity: Severity;
  detail: string;
  /** Plain-language "why this matters" for reproducibility, given the outcome. */
  implication?: string;
  /** Human-readable recomputation, e.g. "reported p=.03; recomputed p=.061". */
  recomputation?: string;
  evidenceId?: string;
  claimId?: string;
  locus?: Locus;
}

export type Stance = "supports" | "contradicts" | "failed_replication" | "neutral";

/** A retrieved external work and its stance toward a claim. */
export interface RetrievedWork {
  id: string; // OpenAlex id
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citedByCount?: number;
  url?: string;
  abstract?: string;
  stance: Stance;
  independent: boolean; // different authors/institutions
  weight: number; // 0..1 evidence weight
  rationale: string;
  claimId: string;
}

/** Per-claim adjudicated verdict. */
export interface Verdict {
  claimId: string;
  replicationLikelihood: number; // calibrated 0..1
  rawScore: number; // pre-calibration
  uncertainty: number; // 0..1 (half-width of the interval)
  ciLow: number;
  ciHigh: number;
  abstain: boolean;
  band: "robust" | "mixed" | "fragile" | "unsupported" | "abstained";
  topReasons: Reason[];
  supportingRefs: string[]; // RetrievedWork ids
  contradictingRefs: string[];
  reasoning: string; // grounded chain
}

export interface Reason {
  text: string;
  direction: "supports" | "undermines" | "neutral";
  weight: number;
  locus?: Locus; // grounding: null → dropped by the grounding guard
  evidenceId?: string;
  refId?: string;
}

export interface PaperMeta {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  doi?: string;
  field: string;
  abstractText?: string;
  labelOutcome?: "replicated" | "failed" | "retracted" | "unknown";
  labelSource?: string;
}

/** Live retrieval result for a claim (from the OpenAlex corpus). */
export interface LiveRetrieval {
  claimId: string;
  query: string;
  count: number;
  sample: {
    title: string;
    year?: number;
    doi?: string;
    url?: string;
    citedByCount?: number;
    authors: string[];
    sources?: string[];
  }[];
  perSource?: Record<string, number>;
}

/** An adversarial-verification record for a high-severity finding. */
export interface VerificationRecord {
  checkId: string;
  label: string;
  refuters: number;
  votesToRefute: number;
  survived: boolean;
  note: string;
}

/** An exportable, reproducibility-by-manifest record of exactly how an audit ran. */
export interface ProvenanceManifest {
  engineVersion: string;
  /** Stable fingerprint of the engine surface (models + prompts + check suite). */
  fingerprint: string;
  generatedAt: string;
  retrievalAt: string;
  adjudicator: string; // model id actually used, or "deterministic-fallback"
  models: { adjudicator: string; extractor: string; triage: string };
  narrativeByClaude: boolean;
  promptVersion: string;
  checkSuite: string;
  sources: string[];
  sourceCount: number;
  claimsAssessed: number;
  groundingRate: number;
  auditId?: string;
  contentHash?: string; // hash of the canonical input, for idempotency & citation
  citation?: string; // a ready-to-cite string
}

/** The full Robustness Report. */
export interface AuditReport {
  paper: PaperMeta;
  claims: Claim[];
  evidence: Evidence[];
  design: DesignAttributes;
  checks: CheckResult[];
  retrieved: RetrievedWork[];
  verdicts: Verdict[];
  liveRetrieval?: LiveRetrieval[];
  verifications?: VerificationRecord[];
  droppedReasons?: number;
  /** External transparency & provenance signals (OA, preprint, registries). */
  signals?: PaperSignals;
  /** Reproducibility-by-manifest record of how this audit was produced. */
  manifest?: ProvenanceManifest;
  /** Plain-language executive summary of the audit (Claude or deterministic). */
  narrative?: string;
  /** Capped source text, for the clickable evidence viewer. */
  sourceText?: string;
  overall: {
    replicationLikelihood: number;
    uncertainty: number;
    ciLow: number;
    ciHigh: number;
    band: Verdict["band"];
    field: string;
    calibrationNote: string;
    verifyFirst: string[]; // claim ids to check first
    groundingRate: number; // fraction of reasons that resolved to a real span
    modelUsed: string;
    retracted?: boolean; // the audited paper is flagged retracted
    retractionReason?: string; // why, if known (Retraction Watch)
    sourceCount?: number; // distinct scholarly sources queried
  };
  meta: {
    generatedAt: string;
    engineVersion: string;
    adjudicator: "claude" | "deterministic-fallback";
    /** Whether the executive summary was written by Claude (vs. the template). */
    narrativeByClaude?: boolean;
    tokensNote?: string;
    auditId?: string;
    /** The input that produced this audit, so it can be re-run (living re-audit). */
    input?: { doi?: string; demoId?: string };
  };
}

/** A paper the user is watching for changes (living re-audit). */
export interface WatchlistEntry {
  id: string; // latest auditId
  title: string;
  field: string;
  band: string;
  likelihood: number;
  doi?: string;
  demoId?: string;
  addedAt: string;
  lastAuditedAt: string;
  previousBand?: string;
  previousLikelihood?: number;
}

/** Compact summary of a stored audit (for lists). */
export interface AuditSummary {
  id: string;
  title: string;
  field: string;
  band: string;
  likelihood: number;
  generatedAt: string;
  reAuditable: boolean;
}

/** Streaming pipeline event. */
export interface StageEvent {
  type: "stage" | "log" | "partial" | "done" | "error";
  stage?: string;
  status?: "start" | "active" | "done" | "skip";
  message?: string;
  detail?: string;
  report?: AuditReport;
  progress?: number;
}
