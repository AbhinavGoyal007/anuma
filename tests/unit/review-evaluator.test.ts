import { describe, expect, it } from "vitest";

import { calculateScorecard, evaluateDeterministicCheck } from "@/modules/review/evaluator";

const check = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Budget identified",
  description: "Customer budget was identified.",
  purpose: "scorecard" as const,
  applicability: "every_interaction" as const,
  evaluationStrategy: "observation" as const,
  observationTypes: ["budget"],
  phrase: null,
  weight: 1,
};

describe("generic review evaluation", () => {
  it("uses an existing observation and its evidence without a model call", () => {
    const result = evaluateDeterministicCheck(
      check,
      [{ type: "budget", valueText: "₹80,000", evidenceGroupId: "evidence-budget" }],
      [],
    );
    expect(result).toMatchObject({ state: "met", evidenceGroupId: "evidence-budget" });
  });

  it("links exact phrase matching to the matching transcript segment", () => {
    const result = evaluateDeterministicCheck(
      { ...check, evaluationStrategy: "phrase", phrase: "DG Shield", observationTypes: [] },
      [],
      [
        { id: "segment-one", role: "representative", text: "The warranty is included." },
        { id: "segment-two", role: "representative", text: "DG Shield is also available." },
      ],
    );
    expect(result).toMatchObject({ state: "met", evidenceSegmentIds: ["segment-two"] });
  });

  it("returns not applicable from configured observation relevance instead of check-key text", () => {
    const result = evaluateDeterministicCheck(
      { ...check, applicability: "when_relevant", observationTypes: ["objection"] },
      [{ type: "budget", valueText: "₹80,000", evidenceGroupId: "evidence-budget" }],
      [],
    );
    expect(result?.state).toBe("not_applicable");
  });

  it("excludes N/A and insufficient evidence from the score denominator", () => {
    expect(
      calculateScorecard([
        { state: "met", weight: 2 },
        { state: "partial", weight: 2 },
        { state: "not_applicable", weight: 3 },
        { state: "insufficient_evidence", weight: 2 },
      ]),
    ).toMatchObject({
      applicableCheckCount: 3,
      evaluatedCheckCount: 2,
      insufficientEvidenceCount: 1,
      scorePercent: 75,
    });
  });
});
