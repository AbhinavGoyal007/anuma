import { describe, expect, it } from "vitest";

import { deriveOutcomeBasis } from "@/modules/interaction-record/outcome-basis";

type Value = { field: string; abstention: string | null; valueText: string | null };
const value = (field: string, valueText: string | null, abstention: string | null = null) =>
  ({ field, valueText, abstention }) as Value;

describe("which evidence settled the business outcome", () => {
  it("reports the transcript when only the conversation established a sale", () => {
    expect(deriveOutcomeBasis([value("confirmed_business_outcome", "sale")])).toBe(
      "conversation_evidence",
    );
  });

  it("prefers verified metadata where a transaction record exists", () => {
    // Both present is the ordinary case once a point-of-sale feed lands, and the
    // receipt outranks the transcript even when the two disagree.
    const basis = deriveOutcomeBasis([
      value("confirmed_business_outcome", "no_sale"),
      value("commercial_outcome", "invoice"),
    ]);
    expect(basis).toBe("verified_metadata");
  });

  it("reports nothing when the outcome itself was abstained", () => {
    // An abstained outcome has no basis. Defaulting it to conversation_evidence
    // would put a provenance on a conclusion nobody reached.
    expect(
      deriveOutcomeBasis([value("confirmed_business_outcome", null, "not_stated")]),
    ).toBeNull();
  });

  it("reports nothing when the outcome field is absent entirely", () => {
    expect(deriveOutcomeBasis([value("final_decision_state", "purchased")])).toBeNull();
  });
});
