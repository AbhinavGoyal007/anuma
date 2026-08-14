import { describe, expect, it } from "vitest";

import {
  normalizeCategoryPhrase,
  resolveSpokenCategories,
  type SpokenDecision,
} from "@/modules/interaction-metrics/category-grouping";

/**
 * Every phrase here is a real extracted `purchase_category` value from AG LLC's
 * interactions. The point being pinned is that six ways of saying "a flat"
 * become one line of demand, and that nothing arrives in a category because a
 * similarity score put it there.
 */

const decisions: SpokenDecision[] = [
  { phrase: "laptop", anumaCategoryKey: "laptop", status: "confirmed" },
  { phrase: "gaming laptop", anumaCategoryKey: "gaming_laptop", status: "confirmed" },
  { phrase: "2 bhk flat", anumaCategoryKey: null, status: "not_relevant" },
  { phrase: "2 bhk property", anumaCategoryKey: null, status: "not_relevant" },
  { phrase: "residential property", anumaCategoryKey: null, status: "not_relevant" },
  // Proposed but never confirmed: a suggestion is not a decision.
  { phrase: "flight ticket to shanghai, china", anumaCategoryKey: "laptop", status: "proposed" },
];

function conversations(entries: [string, string][]): Map<string, string> {
  return new Map(entries);
}

describe("grouping what customers asked for", () => {
  it("collapses different wordings of one category into one bucket", () => {
    const resolution = resolveSpokenCategories(
      conversations([
        ["c1", "laptop"],
        ["c2", "Laptop"],
        ["c3", "  laptop  "],
      ]),
      decisions,
    );

    expect([...resolution.keyByConversation.values()]).toEqual(["laptop", "laptop", "laptop"]);
    expect(resolution.unresolved.size).toBe(0);
  });

  it("keeps categories the ontology genuinely separates apart", () => {
    const resolution = resolveSpokenCategories(
      conversations([
        ["c1", "laptop"],
        ["c2", "gaming laptop"],
      ]),
      decisions,
    );

    expect(resolution.keyByConversation.get("c1")).toBe("laptop");
    expect(resolution.keyByConversation.get("c2")).toBe("gaming_laptop");
  });

  it("counts phrasings outside the covered range without inventing a category", () => {
    const resolution = resolveSpokenCategories(
      conversations([
        ["c1", "2 bhk flat"],
        ["c2", "2 bhk property"],
        ["c3", "residential property"],
      ]),
      decisions,
    );

    expect(resolution.keyByConversation.size).toBe(0);
    expect(resolution.outsideRange).toBe(3);
    expect(resolution.unresolved.size).toBe(0);
  });

  it("never groups by a proposal nobody confirmed", () => {
    const resolution = resolveSpokenCategories(
      conversations([["c1", "flight ticket to Shanghai, China"]]),
      decisions,
    );

    // The proposal said "laptop". It is still not used — the interaction groups
    // under what the customer said, never under a category nobody confirmed.
    expect(resolution.keyByConversation.get("c1")).toBe("flight ticket to shanghai, china");
    expect(resolution.keyByConversation.get("c1")).not.toBe("laptop");
    expect(resolution.unresolved.get("flight ticket to shanghai, china")).toBe(1);
  });

  it("reports an unknown phrasing rather than dropping the interaction", () => {
    const resolution = resolveSpokenCategories(
      conversations([
        ["c1", "laptop"],
        ["c2", "washing machine"],
        ["c3", "washing machine"],
      ]),
      decisions,
    );

    // Every interaction is placed, and the two nobody matched to the range are
    // still reported as unmatched — a retailer sees the demand and is told it
    // was not found in their catalogue.
    expect(resolution.keyByConversation.get("c1")).toBe("laptop");
    expect(resolution.keyByConversation.get("c2")).toBe("washing machine");
    expect(resolution.unresolved.get("washing machine")).toBe(2);
  });

  it("treats a confirmed row with no category as undecided, not as a bucket", () => {
    const resolution = resolveSpokenCategories(conversations([["c1", "tablet"]]), [
      { phrase: "tablet", anumaCategoryKey: null, status: "confirmed" },
    ]);

    // Confirmed with no category is not a mapping to nothing. It groups under
    // the customer's own word rather than creating an unnamed bucket.
    expect(resolution.keyByConversation.get("c1")).toBe("tablet");
    expect(resolution.unresolved.get("tablet")).toBe(1);
  });

  it("prefers the retailer's own word for a phrase over the customer's", () => {
    // A car dealer's customer says "SUV". That is on nobody's fixed list, and
    // grouping only through one left their dashboard empty.
    const resolution = resolveSpokenCategories(
      conversations([["c1", "SUV"]]),
      [],
      new Map([["suv", "Sport Utility"]]),
    );

    expect(resolution.keyByConversation.get("c1")).toBe("Sport Utility");
    expect(resolution.unresolved.size).toBe(0);
  });

  it("normalises only case and surrounding space, matching the SQL summary", () => {
    expect(normalizeCategoryPhrase("  Residential Property / Apartment ")).toBe(
      "residential property / apartment",
    );
    // Not collapsed to "2 bhk flat": that judgement belongs to a person.
    expect(normalizeCategoryPhrase("2 BHK Flat")).not.toBe("2 bhk property");
  });
});
