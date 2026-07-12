/**
 * design.ts, score design-rigor attributes.
 *
 * The attributes themselves are extracted by the model (it reads prose); the
 * *scoring*, which omissions matter and how much, is fixed in code so the
 * judgment is consistent and auditable.
 */

import type { CheckResult, DesignAttributes } from "../types";

interface Rule {
  key: keyof DesignAttributes;
  label: string;
  missingDetail: string;
  severity: CheckResult["severity"];
}

const RULES: Rule[] = [
  {
    key: "randomization",
    label: "Randomization",
    missingDetail:
      "No randomization of treatment allocation reported. Allocation bias can manufacture group differences.",
    severity: "high",
  },
  {
    key: "blinding",
    label: "Blinding",
    missingDetail:
      "No blinding of outcome assessment reported. Unblinded readouts (especially subjective ones) inflate effects.",
    severity: "medium",
  },
  {
    key: "controls",
    label: "Controls",
    missingDetail:
      "Adequate controls not clearly described. Without a proper comparator the effect is uninterpretable.",
    severity: "high",
  },
  {
    key: "multipleComparisonCorrection",
    label: "Multiple-comparison correction",
    missingDetail:
      "No correction for multiple comparisons reported despite multiple tests. Uncorrected, some 'significant' results are expected by chance.",
    severity: "medium",
  },
  {
    key: "preregistration",
    label: "Pre-registration",
    missingDetail:
      "Not pre-registered. Analytic flexibility (researcher degrees of freedom) is unconstrained.",
    severity: "low",
  },
  {
    key: "dataAvailable",
    label: "Data availability",
    missingDetail: "Underlying data not available for independent checking.",
    severity: "low",
  },
  {
    key: "codeAvailable",
    label: "Code availability",
    missingDetail: "Analysis code not available for independent checking.",
    severity: "low",
  },
];

export function runDesignChecks(d: DesignAttributes): CheckResult[] {
  const out: CheckResult[] = [];
  for (const rule of RULES) {
    const v = d[rule.key] as boolean | null | undefined;
    if (v === true) {
      out.push({
        id: `design:${rule.key}`,
        check: "design",
        label: `Design · ${rule.label}`,
        status: "pass",
        severity: "info",
        detail: `${rule.label} reported.`,
      });
    } else if (v === false) {
      // Explicitly absent in the text: high/medium rigor items are failures,
      // low-severity omissions (code/data/prereg) are warnings.
      const isFail = rule.severity !== "low";
      out.push({
        id: `design:${rule.key}`,
        check: "design",
        label: `Design · ${rule.label}`,
        status: isFail ? "fail" : "warn",
        severity: rule.severity,
        detail: rule.missingDetail,
      });
    } else {
      // null/undefined: the attribute could not be determined from the supplied
      // text (e.g. only the title/abstract was ingested). This is NOT evidence
      // against the paper, so it is marked "not assessable" and never counts.
      out.push({
        id: `design:${rule.key}`,
        check: "design",
        label: `Design · ${rule.label}`,
        status: "na",
        severity: "info",
        detail: `Not assessable from the supplied text. ${rule.label} was neither reported nor ruled out in the text that was ingested, so it is not counted for or against the paper.`,
      });
    }
  }

  // Sample-size sanity for preclinical work.
  if (d.perGroupN != null && d.perGroupN > 0) {
    const small = d.perGroupN < 8;
    out.push({
      id: "design:sample",
      check: "design",
      label: "Design · Sample size",
      status: small ? "warn" : "pass",
      severity: small ? "medium" : "info",
      detail: small
        ? `Only ${d.perGroupN} per group. Small samples give unstable estimates and inflated effect sizes.`
        : `${d.perGroupN} per group.`,
    });
  }
  if (d.biologicalReplicates != null && d.biologicalReplicates < 3) {
    out.push({
      id: "design:bioreps",
      check: "design",
      label: "Design · Biological replicates",
      status: "warn",
      severity: "medium",
      detail: `Only ${d.biologicalReplicates} biological replicate(s). Fewer than three cannot support a general claim.`,
    });
  }
  return out;
}
