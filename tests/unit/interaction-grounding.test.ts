import { describe, expect, it } from "vitest";

import type { ExtractedValue } from "@/modules/interaction-record/extraction-contract";
import { groundValues, rejectionRate } from "@/modules/interaction-record/grounding";

/**
 * Structured output guarantees shape, not truth. These are the checks that stop
 * a well-formed invention reaching a record whose whole claim is that any
 * metric drills back to something a person said.
 */

const SEG_A = "00000000-0000-4000-8000-00000000000a";
const SEG_B = "00000000-0000-4000-8000-00000000000b";
const segments = new Set([SEG_A, SEG_B]);

function value(over: Partial<ExtractedValue> & { field: ExtractedValue["field"] }): ExtractedValue {
  return {
    valueText: null,
    valueNumber: null,
    amountMajor: null,
    amountScale: null,
    currency: null,
    attributedTo: null,
    label: null,
    evidenceSegmentIds: [SEG_A],
    abstention: null,
    ...over,
  };
}

describe("evidence grounding", () => {
  it("accepts a value the transcript supports", () => {
    const result = groundValues(
      [value({ field: "target_budget", amountMajor: 35, amountScale: "lakh", currency: "INR" })],
      segments,
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects a value citing a segment that does not exist", () => {
    // The dangerous failure: a plausible number with a fabricated citation.
    const result = groundValues(
      [
        value({
          field: "target_budget",
          amountMajor: 80,
          amountScale: "lakh",
          currency: "INR",
          evidenceSegmentIds: ["00000000-0000-4000-8000-0000000000ff"],
        }),
      ],
      segments,
    );

    expect(result.rejected[0]?.reason).toBe("unknown_segment");
    expect(result.accepted).toHaveLength(0);
  });

  it("rejects a value with no citation at all", () => {
    const result = groundValues(
      [value({ field: "objections", valueText: "price too high", evidenceSegmentIds: [] })],
      segments,
    );

    expect(result.rejected[0]?.reason).toBe("missing_evidence");
  });

  it("rejects an unknown field", () => {
    const result = groundValues(
      [value({ field: "revenue_forecast" as ExtractedValue["field"], valueText: "high" })],
      segments,
    );

    expect(result.rejected[0]?.reason).toBe("unknown_field");
  });
});

describe("abstention", () => {
  it("is an answer, and needs neither value nor evidence", () => {
    // "The customer never mentioned a budget" is a commercial finding, and it
    // must be distinguishable from a field the model simply failed on.
    const result = groundValues(
      [value({ field: "maximum_budget", abstention: "not_stated", evidenceSegmentIds: [] })],
      segments,
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.abstention).toBe("not_stated");
  });

  it("carries the reason, because the reasons mean different things", () => {
    const result = groundValues(
      [
        value({
          field: "purchase_timing",
          abstention: "insufficient_evidence",
          evidenceSegmentIds: [],
        }),
        value({ field: "brand_preferences", abstention: "ambiguous", evidenceSegmentIds: [] }),
      ],
      segments,
    );

    expect(result.accepted.map((v) => v.abstention)).toEqual([
      "insufficient_evidence",
      "ambiguous",
    ]);
  });
});

describe("value shape", () => {
  it("rejects money with no currency", () => {
    const result = groundValues(
      [value({ field: "competitor_price_claim", amountMajor: 78, amountScale: "thousand" })],
      segments,
    );

    expect(result.rejected[0]?.reason).toBe("missing_currency");
  });

  it("rejects an enum value outside its permitted set", () => {
    const result = groundValues(
      [value({ field: "arrival_intent_state", valueText: "very keen" })],
      segments,
    );

    expect(result.rejected[0]?.reason).toBe("invalid_enum_value");
  });

  it("accepts a permitted enum value", () => {
    const result = groundValues(
      [value({ field: "arrival_intent_state", valueText: "exploratory" })],
      segments,
    );

    expect(result.accepted).toHaveLength(1);
  });

  it("rejects a claimed value with nothing in it", () => {
    const result = groundValues([value({ field: "initial_request", valueText: "  " })], segments);

    expect(result.rejected[0]?.reason).toBe("missing_value");
  });
});

describe("cardinality", () => {
  it("keeps every instance of a multi-valued field", () => {
    const result = groundValues(
      [
        value({ field: "objections", valueText: "price", evidenceSegmentIds: [SEG_A] }),
        value({ field: "objections", valueText: "weight", evidenceSegmentIds: [SEG_B] }),
      ],
      segments,
    );

    expect(result.accepted).toHaveLength(2);
  });

  it("refuses a second answer to a single-answer field", () => {
    // Two target budgets means neither can be trusted; the conflict is surfaced
    // rather than silently resolved.
    const result = groundValues(
      [
        value({ field: "target_budget", amountMajor: 35, amountScale: "lakh", currency: "INR" }),
        value({ field: "target_budget", amountMajor: 80, amountScale: "lakh", currency: "INR" }),
      ],
      segments,
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("duplicate_single_value");
  });
});

describe("rejectionRate", () => {
  it("is zero when nothing was extracted", () => {
    expect(rejectionRate({ accepted: [], rejected: [] })).toBe(0);
  });

  it("reports the share the transcript did not support", () => {
    const result = groundValues(
      [
        value({ field: "objections", valueText: "price" }),
        value({ field: "objections", valueText: "ghost", evidenceSegmentIds: ["nope"] }),
      ],
      segments,
    );

    expect(rejectionRate(result)).toBe(0.5);
  });
});

describe("an abstention overrides any value beside it", () => {
  it("clears the value slots when the model abstains and guesses at once", () => {
    // Models return both more often than you would expect. Storing the guess
    // would record a fact the model itself declined to assert — and the
    // database rejects the contradiction outright.
    const result = groundValues(
      [
        value({
          field: "maximum_budget",
          abstention: "not_stated",
          amountMajor: 80,
          amountScale: "lakh",
          currency: "INR",
          valueText: "around 80 lakh",
        }),
      ],
      segments,
    );

    const [only] = result.accepted;
    expect(only?.abstention).toBe("not_stated");
    expect(only?.valueText).toBeNull();
    expect(only?.amountMajor).toBeNull();
    expect(only?.currency).toBeNull();
  });
});
