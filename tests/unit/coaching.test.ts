import { describe, expect, it } from "vitest";

import { deriveCoachingMoments } from "@/modules/interaction-record/coaching";
import type { RecordFieldValue } from "@/modules/interaction-record/data";

/**
 * Coaching moments are computed from facts, not judged by a model, so the rules
 * that turn a fact into a moment are pinned here — a manager acts on this list.
 */

function value(over: Partial<RecordFieldValue> & { fieldKey: string }): RecordFieldValue {
  return {
    valueId: "v",
    displayLabel: over.fieldKey,
    sourceClass: "evidence_extracted",
    abstention: null,
    valueText: null,
    valueNumber: null,
    spokenAmount: null,
    spokenScale: null,
    amountMinor: null,
    currency: null,
    attributedTo: null,
    label: null,
    hasEvidence: true,
    correction: null,
    ...over,
  };
}

describe("deriveCoachingMoments", () => {
  it("surfaces red flags, unaddressed objections, missed alternative and no demo", () => {
    const moments = deriveCoachingMoments([
      value({
        fieldKey: "red_flags",
        valueText: "spoke badly of a brand",
        label: "negative_remark",
      }),
      value({ fieldKey: "objections", valueText: "too expensive" }),
      value({ fieldKey: "objection_response", valueText: "none" }),
      value({ fieldKey: "alternative_offered", valueText: "no" }),
      value({ fieldKey: "product_demo_performed", valueText: "no" }),
    ]);

    expect(moments.map((m) => m.category)).toEqual([
      "Red flag · negative remark",
      "Objection handling",
      "Alternative",
      "Demo",
    ]);
    expect(moments[0]!.severity).toBe("high");
    expect(moments[1]!.summary).toContain("too expensive");
  });

  it("prefers the stronger objection signal and stays quiet on a clean interaction", () => {
    const partial = deriveCoachingMoments([
      value({ fieldKey: "objection_response", valueText: "partial" }),
    ]);
    expect(partial).toHaveLength(1);
    expect(partial[0]!.severity).toBe("low");

    const clean = deriveCoachingMoments([
      value({ fieldKey: "objection_response", valueText: "full" }),
      value({ fieldKey: "alternative_offered", valueText: "yes" }),
      value({ fieldKey: "product_demo_performed", valueText: "yes" }),
    ]);
    expect(clean).toHaveLength(0);
  });

  it("ignores abstained values", () => {
    const moments = deriveCoachingMoments([
      value({ fieldKey: "alternative_offered", valueText: null, abstention: "not_stated" }),
      value({ fieldKey: "product_demo_performed", valueText: null, abstention: "not_stated" }),
    ]);
    expect(moments).toHaveLength(0);
  });
});
