import { describe, expect, it } from "vitest";

import {
  commercialActions,
  hasCommercialActions,
  segmentHierarchy,
  type ActionInputValue,
} from "@/modules/interaction-record/commercial-actions";

const value = (
  fieldKey: string,
  valueText: string | null,
  label: string | null = null,
  abstention: string | null = null,
): ActionInputValue => ({ fieldKey, valueText, label, abstention });

describe("splitting a flat run of hierarchy rows back into pitches", () => {
  it("starts a new pitch when a level repeats", () => {
    const groups = segmentHierarchy([
      value("h", "computers", "primary_department"),
      value("h", "bags", "pitched_category"),
      value("h", "computers", "primary_department"),
      value("h", "warranty", "pitched_category"),
      value("h", "SecurePlus", "pitched_brand"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.map((level) => level.value)).toEqual(["computers", "bags"]);
    expect(groups[1]!.map((level) => level.value)).toEqual(["computers", "warranty", "SecurePlus"]);
  });

  it("handles pitches of unequal depth", () => {
    // The case a fixed stride gets wrong: the first pitch named a brand and the
    // second did not, so counting rows would put the brand on the wrong pitch.
    const groups = segmentHierarchy([
      value("h", "audio", "pitched_category"),
      value("h", "Sony", "pitched_brand"),
      value("h", "cases", "pitched_category"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(1);
  });

  it("returns nothing for an empty run", () => {
    expect(segmentHierarchy([])).toEqual([]);
  });
});

describe("the four commercial actions", () => {
  it("attaches each pitch to its own hierarchy", () => {
    const actions = commercialActions([
      value("cross_sell_offered", "yes"),
      value("cross_sell_pitch", "laptop bag", "accessory"),
      value("cross_sell_pitch", "2-year protection", "warranty_service_plan"),
      value("cross_sell_hierarchy", "computers", "primary_department"),
      value("cross_sell_hierarchy", "bags", "pitched_category"),
      value("cross_sell_hierarchy", "computers", "primary_department"),
      value("cross_sell_hierarchy", "services", "pitched_department"),
    ]);
    expect(actions.crossSell.verdict).toBe("yes");
    expect(actions.crossSell.pitches).toHaveLength(2);
    expect(actions.crossSell.pitches[0]!.kind).toBe("accessory");
    expect(actions.crossSell.pitches[0]!.hierarchy.map((l) => l.value)).toEqual([
      "computers",
      "bags",
    ]);
    expect(actions.crossSell.pitches[1]!.hierarchy.map((l) => l.level)).toEqual([
      "primary_department",
      "pitched_department",
    ]);
  });

  it("keeps a pitch that has no hierarchy at all", () => {
    // Going only as deep as the conversation supports is what the spec asks for,
    // so a pitch with nothing beneath it is a correct result, not a broken row.
    const actions = commercialActions([
      value("upsell_offered", "yes"),
      value("upsell_pitch", "128 GB to 256 GB", "storage"),
    ]);
    expect(actions.upsell.pitches[0]!.hierarchy).toEqual([]);
    expect(actions.upsell.pitches[0]!.what).toBe("128 GB to 256 GB");
  });

  it("derives the verdict from the pitches rather than trusting a separate answer", () => {
    // Nothing pitched and nothing to pitch are different findings, and the pitch
    // field's own abstention is what tells them apart.
    const none = commercialActions([value("cross_sell_pitch", null, null, "not_stated")]);
    expect(none.crossSell.verdict).toBe("no");

    const unclear = commercialActions([
      value("cross_sell_pitch", null, null, "insufficient_evidence"),
    ]);
    expect(unclear.crossSell.verdict).toBe("uncertain");

    const inapplicable = commercialActions([value("cross_sell_pitch", null, null, "unknown")]);
    expect(inapplicable.crossSell.verdict).toBeNull();
    expect(inapplicable.crossSell.abstention).toBe("unknown");

    const offered = commercialActions([value("cross_sell_pitch", "laptop bag", "accessory")]);
    expect(offered.crossSell.verdict).toBe("yes");
  });

  it("cannot claim an offer it lists no pitch for", () => {
    // The failure the stored verdict allowed: a record asserting a cross-sell
    // happened while listing none, which a manager would chase and not find.
    const actions = commercialActions([value("purchase_category", "laptop")]);
    expect(actions.crossSell.verdict).toBeNull();
    expect(actions.crossSell.pitches).toEqual([]);
  });

  it("reads the outcome alongside the evidence it rests on", () => {
    const actions = commercialActions([
      value("confirmed_business_outcome", "sale"),
      value("outcome_basis", "conversation_evidence"),
    ]);
    expect(actions.outcome).toEqual({ value: "sale", basis: "conversation_evidence" });
  });

  it("reads an alternative as a verdict rather than a product list", () => {
    // alternative_offered answers whether a substitute was needed at all. Read
    // as a list it would print the raw enum token onto the page.
    const actions = commercialActions([value("alternative_offered", "not_applicable")]);
    expect(actions.alternativeOffered).toBe("not_applicable");
  });

  it("is empty on a record that reached none of these", () => {
    expect(hasCommercialActions(commercialActions([value("purchase_category", "laptop")]))).toBe(
      false,
    );
  });
});
