import { describe, expect, it } from "vitest";

import { metricRows, type MetricSegment } from "@/modules/analysis/metrics";
import { evaluateDeterministicCheck, type ReviewCheck } from "@/modules/review/evaluator";

const budgetCheck: ReviewCheck = {
  applicability: "every_interaction",
  description: "A customer budget was identified.",
  evaluationStrategy: "observation",
  id: "00000000-0000-4000-8000-000000000001",
  name: "Budget identified",
  observationTypes: ["budget"],
  phrase: null,
  purpose: "scorecard",
  weight: 1,
};
const priceCheck: ReviewCheck = {
  ...budgetCheck,
  applicability: "when_relevant",
  evaluationStrategy: "semantic",
  id: "00000000-0000-4000-8000-000000000002",
  name: "Price objection handled when applicable",
  observationTypes: ["objection", "competitor_price"],
};

function metrics(segments: MetricSegment[]) {
  return new Map(metricRows(segments).map((row) => [row.metric_key, row.numeric_value]));
}

describe("Phase 5 interaction diversity", () => {
  it("keeps a complete sales interaction rich without hardcoding a product", () => {
    const result = evaluateDeterministicCheck(
      budgetCheck,
      [{ evidenceGroupId: "evidence", type: "budget", valueText: "INR 80000" }],
      [],
    );
    expect(result?.state).toBe("met");
  });

  it("does not turn omitted commercial facts into failures when a check is not applicable", () => {
    const result = evaluateDeterministicCheck(priceCheck, [], []);
    expect(result?.state).toBe("not_applicable");
    expect(result?.evidenceSegmentIds).toEqual([]);
  });

  it("reflects customer-led and representative-led interactions without judging either pattern", () => {
    const customerLed = metrics([
      {
        role: "representative",
        start_milliseconds: 0,
        end_milliseconds: 1_000,
        original_text: "hello",
      },
      {
        role: "customer",
        start_milliseconds: 1_000,
        end_milliseconds: 8_000,
        original_text: "long customer request",
      },
    ]);
    const representativeLed = metrics([
      { role: "customer", start_milliseconds: 0, end_milliseconds: 1_000, original_text: "hello" },
      {
        role: "representative",
        start_milliseconds: 1_000,
        end_milliseconds: 8_000,
        original_text: "long explanation",
      },
    ]);
    expect(customerLed.get("customer_talk_share")).toBeGreaterThan(
      customerLed.get("representative_talk_share")!,
    );
    expect(representativeLed.get("representative_talk_share")).toBeGreaterThan(
      representativeLed.get("customer_talk_share")!,
    );
  });

  it("keeps product categories generic: television, smartphone and laptop observations use the same check", () => {
    for (const valueText of [
      "Television for streaming",
      "Smartphone with camera",
      "Laptop for college",
    ]) {
      const result = evaluateDeterministicCheck(
        { ...budgetCheck, name: "Relevant product discussed", observationTypes: ["product"] },
        [{ evidenceGroupId: "evidence", type: "product", valueText }],
        [],
      );
      expect(result?.state).toBe("met");
    }
  });
});
