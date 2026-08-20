import { describe, expect, it } from "vitest";

import {
  CORRECTION_LIMITS,
  correctionFor,
  type Correction,
} from "@/modules/intelligence/corrections";
import { presenceOf } from "@/modules/intelligence/effective";

import { row, value } from "../support/population";

describe("what a human correction does to a value", () => {
  const at = (createdAt: string, extra: Partial<Correction> = {}): Correction => ({
    fieldValueId: "v1",
    correctedText: null,
    isRejected: false,
    createdAt,
    ...extra,
  });

  it("leaves an uncorrected value alone", () => {
    expect(correctionFor("v1", [])).toEqual({ kind: "kept" });
  });

  it("uses the corrected text in place of the original", () => {
    expect(correctionFor("v1", [at("2026-08-01T10:00:00Z", { correctedText: "45000" })])).toEqual({
      kind: "corrected",
      text: "45000",
    });
  });

  it("removes a rejected value from every metric", () => {
    // A manager who rejects a reading is saying it should not have been there.
    // Leaving it in the denominator honours the letter of that and not the point.
    expect(correctionFor("v1", [at("2026-08-01T10:00:00Z", { isRejected: true })])).toEqual({
      kind: "rejected",
    });
  });

  it("obeys the newest correction when there are several", () => {
    const outcome = correctionFor("v1", [
      at("2026-08-01T10:00:00Z", { correctedText: "first" }),
      at("2026-08-17T10:00:00Z", { correctedText: "second" }),
      at("2026-08-05T10:00:00Z", { correctedText: "middle" }),
    ]);
    expect(outcome).toEqual({ kind: "corrected", text: "second" });
  });

  it("keeps the original when a correction cleared the text without rejecting", () => {
    expect(correctionFor("v1", [at("2026-08-01T10:00:00Z", { correctedText: "" })])).toEqual({
      kind: "kept",
    });
  });

  it("ignores corrections belonging to another value", () => {
    const other: Correction = {
      fieldValueId: "v2",
      correctedText: "not mine",
      isRejected: false,
      createdAt: "2026-08-17T10:00:00Z",
    };
    expect(correctionFor("v1", [other])).toEqual({ kind: "kept" });
  });

  it("states what corrections cannot reach", () => {
    // The table stores replacement text and a rejection flag and nothing else,
    // so a misread amount or a mislabelled dimension can only be rejected.
    expect(CORRECTION_LIMITS).toContain("cannot be corrected in place");
  });
});

describe("what a correction does to the reading a page shows", () => {
  const rejected = (fieldKey: string) =>
    value(fieldKey, null, { abstention: "rejected_by_reviewer" });

  it("does not let a rejected value fall back to the projection", () => {
    // The failure this pins: dropping a rejected value made the field look as
    // though it had never been extracted, and an unsupported field falls back
    // to the conversation-level projection — so rejecting a wrong category
    // brought the old category straight back, over the correction.
    const corrected = row({
      values: [rejected("purchase_category")],
      projection: { purchaseCategory: "washing machine" },
    });
    expect(corrected.purchaseCategory).toBeNull();

    // And the field is still a question that was asked, so the reading is
    // unusable rather than a negative fact about the interaction.
    expect(presenceOf(corrected.values, "purchase_category")).toBe("unusable");
  });

  it("still falls back where the field genuinely was never extracted", () => {
    const untouched = row({ values: [], projection: { purchaseCategory: "washing machine" } });
    expect(untouched.purchaseCategory).toBe("washing machine");
  });

  it("lets a corrected category be the one the page filters and groups by", () => {
    // The population narrows on `row.purchaseCategory`, which is the effective
    // reading. A corrected category that the filter could not select was a
    // manager fixing a value and watching the page ignore them.
    const fixed = row({
      values: [value("purchase_category", "gaming laptop")],
      projection: { purchaseCategory: "laptop" },
    });
    const narrow = (rows: (typeof fixed)[], category: string) =>
      rows.filter((item) => item.purchaseCategory === category);

    expect(fixed.purchaseCategory).toBe("gaming laptop");
    expect(narrow([fixed], "gaming laptop")).toHaveLength(1);
    // And the stale projection no longer selects it.
    expect(narrow([fixed], "laptop")).toHaveLength(0);
  });
});
