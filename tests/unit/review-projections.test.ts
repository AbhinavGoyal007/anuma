import { describe, expect, it } from "vitest";

import { coachingFor, notesFor, type ReviewProjection } from "@/modules/review/projections";

const review: ReviewProjection = {
  checks: [
    {
      applicabilityReason: "The customer compared a lower Amazon price.",
      description:
        "The representative should make the value difference clear after a price comparison.",
      evidenceSegmentId: "00000000-0000-4000-8000-000000000001",
      explanation: "No clear value response was observed.",
      id: "00000000-0000-4000-8000-000000000002",
      name: "Price objection handled",
      purpose: "scorecard",
      state: "not_met",
    },
  ],
  scorecards: [],
  status: "completed",
};

describe("review projections", () => {
  it("composes normalized notes without a model call", () => {
    expect(
      notesFor([
        { amountMinor: 8_000_000, currencyCode: "INR", text: null, type: "budget" },
        { amountMinor: null, currencyCode: null, text: "Lenovo LOQ", type: "product" },
      ]),
    ).toEqual([
      ["Budget", "₹80,000"],
      ["Products and specs", "Lenovo LOQ"],
    ]);
  });

  it("turns an evidence-backed price-comparison gap into specific coaching", () => {
    const coaching = coachingFor(review, [
      { amountMinor: 7_800_000, currencyCode: "INR", text: null, type: "competitor_price" },
    ]);

    expect(coaching.opportunities).toHaveLength(1);
    expect(coaching.opportunities[0]).toMatchObject({
      evidenceSegmentId: "00000000-0000-4000-8000-000000000001",
      name: "Price objection handled",
    });
    expect(coaching.opportunities[0].advice).toContain("value difference explicit");
  });
});
