import { describe, expect, it } from "vitest";

import {
  CORRECTION_LIMITS,
  correctionFor,
  type Correction,
} from "@/modules/intelligence/corrections";

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
