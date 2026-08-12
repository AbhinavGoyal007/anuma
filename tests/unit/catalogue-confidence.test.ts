import { describe, expect, it } from "vitest";

import {
  CLEAR_MARGIN,
  isBulkConfirmable,
  proposalConfidence,
} from "@/modules/catalogue/confidence";
import { labelSentence } from "@/modules/catalogue/labels";

/**
 * The numbers here are measured, not invented: each is what
 * text-embedding-3-small actually returned for that label against the ANUMA
 * ontology. They are pinned because this rule decides which rows a person never
 * reads, and a drift in it is a wrong category nobody was asked about.
 */

describe("deciding what may be confirmed in bulk", () => {
  it("holds back a label whose top two categories are neck and neck", () => {
    // smartphone 0.583 over accessory 0.508 — a high score, and wrong.
    expect(proposalConfidence("smartphone", 0.076)).toBe("ambiguous");
    expect(isBulkConfirmable("smartphone", 0.076)).toBe(false);

    // smartphone 0.482 over accessory 0.449 — wrong again, barely separated.
    expect(isBulkConfirmable("smartphone", 0.033)).toBe(false);
  });

  it("passes a label the model separated clearly, even at a modest score", () => {
    // Copilot+ PC: laptop at 0.579, second place 0.384. Right.
    expect(proposalConfidence("laptop", 0.196)).toBe("clear");
    // Mobile Acc Data Cable: accessory at 0.429, the lowest right answer measured.
    expect(isBulkConfirmable("accessory", 0.101)).toBe(true);
  });

  it("does not rank by score, which settles nothing", () => {
    // The wrong call scored higher than the right one. Only the margin separates
    // them, so the rule must not consult the score at all.
    const wrongButHigherScoring = isBulkConfirmable("smartphone", 0.076);
    const rightButLowerScoring = isBulkConfirmable("laptop", 0.196);
    expect(wrongButHigherScoring).toBe(false);
    expect(rightButLowerScoring).toBe(true);
  });

  it("treats an unopposed proposal as clear and a missing one as none", () => {
    expect(proposalConfidence("laptop", null)).toBe("clear");
    expect(proposalConfidence(null, 0.9)).toBe("none");
    expect(isBulkConfirmable(null, 0.9)).toBe(false);
  });

  it("puts the boundary exactly where it is documented", () => {
    expect(isBulkConfirmable("laptop", CLEAR_MARGIN)).toBe(true);
    expect(isBulkConfirmable("laptop", CLEAR_MARGIN - 0.001)).toBe(false);
  });
});

describe("how a label is put to the model", () => {
  it("leads with the subgroup and lets the group qualify it", () => {
    expect(labelSentence("Notebooks", "Copilot+ PC")).toBe("Copilot+ PC, a kind of Notebooks");
  });

  it("does not repeat a group that is already the subgroup", () => {
    expect(labelSentence("Power Banks", "Power Banks")).toBe("Power Banks");
  });

  it("copes with a label that has only one half", () => {
    expect(labelSentence("Notebooks", "")).toBe("Notebooks");
    expect(labelSentence("", "Clamshell")).toBe("Clamshell");
  });
});
