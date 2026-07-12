import { describe, it, expect } from "vitest";
import type { LLMClient } from "../llm";
import { claudeVerdict } from "../adjudicate";
import { claudeClaimGraph } from "../extract/claims";
import { classifyStances } from "../extract/stance";
import { claudePdfStats } from "../extract/pdf-vision";
import { extractTableEvidence } from "../extract/tables";
import type { Claim, Evidence } from "../types";
import type { OpenAlexWork } from "../retrieval/openalex";

// A mock client that returns a forced tool call with the given input.
const mock = (input: unknown): LLMClient => ({
  messages: { create: async () => ({ content: [{ type: "tool_use", name: "t", input }] }) },
});
const throwing: LLMClient = {
  messages: { create: async () => { throw new Error("boom"); } },
};
const noTool: LLMClient = {
  messages: { create: async () => ({ content: [{ type: "text" }] }) },
};

const claim: Claim = {
  id: "c1",
  text: "Treatment increases recovery",
  type: "causal",
  isCentral: true,
  evidenceIds: ["e1"],
  loci: [],
};
const evidence: Evidence[] = [
  { id: "e1", kind: "stat", text: "t-test", locus: { section: "Results", page: 1, quote: "t(20)=2.5" } },
];

describe("claudeVerdict (mocked)", () => {
  it("parses a forced tool call into a Verdict, grounding reasons to evidence", async () => {
    const v = await claudeVerdict(claim, evidence, [], [], "biomedical", mock({
      replication_likelihood: 0.72,
      uncertainty: 0.1,
      abstain: false,
      reasoning: "strong prior support",
      top_reasons: [{ text: "supported", direction: "supports", weight: 0.6, evidence_id: "e1" }],
    }));
    expect(v).not.toBeNull();
    expect(v!.rawScore).toBeCloseTo(0.72, 5);
    expect(v!.band).toBe("robust");
    expect(v!.topReasons[0].locus).toEqual(evidence[0].locus);
  });
  it("returns null on client error", async () => {
    expect(await claudeVerdict(claim, evidence, [], [], "x", throwing)).toBeNull();
  });
  it("returns null when there is no tool call", async () => {
    expect(await claudeVerdict(claim, evidence, [], [], "x", noTool)).toBeNull();
  });
  it("abstains when the model returns no usable score", async () => {
    const v = await claudeVerdict(claim, evidence, [], [], "x", mock({
      uncertainty: 0.2, abstain: false, reasoning: "", top_reasons: [],
    }));
    expect(v!.abstain).toBe(true);
  });
});

describe("claudeClaimGraph (mocked)", () => {
  it("returns the model's claims and attaches extracted statistics", async () => {
    const g = await claudeClaimGraph(
      "A Study of Recovery",
      "The treatment worked, t(20) = 2.5, p = .02.",
      mock({ field: "biomedical", claims: [{ id: "c1", text: "the treatment worked", type: "causal", is_central: true, evidence_quotes: ["t(20)"] }] }),
    );
    expect(g).not.toBeNull();
    expect(g!.field).toBe("biomedical");
    expect(g!.claims[0].text).toBe("the treatment worked");
    expect(g!.evidence.some((e) => e.stat?.test === "t")).toBe(true);
  });
  it("falls back to the heuristic graph on error", async () => {
    const g = await claudeClaimGraph("Title", "t(20) = 2.5, p = .02.", throwing);
    expect(g).not.toBeNull();
    expect(g!.claims[0].text).toBe("Title");
  });
});

describe("classifyStances (mocked)", () => {
  const works: OpenAlexWork[] = [
    { id: "W1", title: "Failed to reproduce", authors: ["a"], year: 2021, abstract: "we could not replicate" },
    { id: "W2", title: "Unrelated", authors: ["b"], year: 2019, abstract: "off topic" },
  ];
  it("maps stances and drops neutral works", async () => {
    const r = await classifyStances(claim, works, mock({
      works: [
        { id: "W1", stance: "failed_replication", weight: 0.9, independent: true, rationale: "direct" },
        { id: "W2", stance: "neutral", weight: 0.1, rationale: "n/a" },
      ],
    }));
    expect(r.length).toBe(1);
    expect(r[0].stance).toBe("failed_replication");
    expect(r[0].claimId).toBe("c1");
    expect(r[0].weight).toBeCloseTo(0.9, 5);
  });
  it("returns [] with no client (no key)", async () => {
    expect((await classifyStances(claim, works)).length).toBe(0);
  });
});

describe("claudePdfStats (mocked)", () => {
  it("builds checkable evidence from vision-read statistics and drops invalid ones", async () => {
    const r = await claudePdfStats("BASE64PDF", mock({
      statistics: [
        { test: "t", value: 2.1, df1: 28, reported_p: ".03", source: "figure", quote: "t(28) = 2.1, p = .03" },
        { test: "bogus", value: 1, quote: "nope" },
      ],
    }));
    expect(r.evidence.length).toBe(1);
    expect(r.evidence[0].stat!.test).toBe("t");
    expect(r.evidence[0].stat!.df1).toBe(28);
    expect(r.evidence[0].locus.section).toBe("Figure");
    expect(r.lines[0]).toContain("t(28)");
  });
  it("returns nothing without a client (no key)", async () => {
    expect((await claudePdfStats("B64")).evidence.length).toBe(0);
  });
});

describe("extractTableEvidence", () => {
  it("parses a Mean / SD / N table and detects scale bounds", () => {
    const xml = `<table-wrap><caption><p>Table 1. Ratings on a 1-7 scale</p></caption><table><thead><tr><th>Condition</th><th>M</th><th>SD</th><th>N</th></tr></thead><tbody><tr><td>Treatment</td><td>5.19</td><td>1.34</td><td>28</td></tr><tr><td>Control</td><td>3.48</td><td>0.30</td><td>21</td></tr></tbody></table></table-wrap>`;
    const { evidence, lines } = extractTableEvidence(xml);
    expect(evidence.length).toBe(2);
    expect(evidence[0].descriptive!.mean).toBeCloseTo(5.19, 5);
    expect(evidence[0].descriptive!.n).toBe(28);
    expect(evidence[0].descriptive!.scaleMin).toBe(1);
    expect(evidence[0].descriptive!.scaleMax).toBe(7);
    expect(lines[0]).toContain("mean 5.19");
  });
  it("parses a combined 'Mean (SD)' column", () => {
    const xml = `<table><tr><th>Group</th><th>Mean (SD)</th><th>n</th></tr><tr><td>A</td><td>4.19 (0.55)</td><td>17</td></tr></table>`;
    const { evidence } = extractTableEvidence(xml);
    expect(evidence.length).toBe(1);
    expect(evidence[0].descriptive!.mean).toBeCloseTo(4.19, 5);
    expect(evidence[0].descriptive!.sd).toBeCloseTo(0.55, 5);
    expect(evidence[0].descriptive!.n).toBe(17);
  });
});
