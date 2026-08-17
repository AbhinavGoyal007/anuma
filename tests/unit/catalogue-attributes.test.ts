import { describe, expect, it } from "vitest";

import { extractAttributes } from "@/modules/catalogue/attribute-extract";
import { judgeAttribute } from "@/modules/catalogue/attribute-plausibility";
import { findMissedOpportunity } from "@/modules/catalogue/missed-opportunity";
import {
  isUsableDefinition,
  nodeKey,
  type AttributeDefinition,
} from "@/modules/catalogue/attribute-schema";

function numeric(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    key: "capacity_kg",
    kind: "numeric",
    comparison: "at_least",
    unitTokens: ["KG", "Kg"],
    unit: "kg",
    range: { min: 3, max: 30 },
    vocabulary: {},
    ...overrides,
  };
}

function categorical(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    key: "load_type",
    kind: "categorical",
    comparison: "equals",
    unitTokens: [],
    unit: null,
    range: null,
    vocabulary: { front_load: ["front load", "FL"], top_load: ["top load", "TL"] },
    ...overrides,
  };
}

describe("attribute definitions", () => {
  it("rejects a numeric attribute with no unit, which would match every number", () => {
    expect(isUsableDefinition(numeric({ unitTokens: [] }))).toBe(false);
  });

  it("rejects a numeric attribute with no range, which cannot exclude model numbers", () => {
    expect(isUsableDefinition(numeric({ range: null }))).toBe(false);
  });

  it("rejects a vocabulary of one, which every product in the node would carry", () => {
    expect(isUsableDefinition(categorical({ vocabulary: { front_load: ["front load"] } }))).toBe(
      false,
    );
  });

  it("names a node in the retailer's own words", () => {
    expect(nodeKey({ dept: "MDA", group: "Laundry", subgroup: "Washing Machines" })).toBe(
      "MDA > Laundry > Washing Machines",
    );
  });
});

describe("extraction against real catalogue shapes", () => {
  it("reads a capacity attached to its unit", () => {
    expect(extractAttributes("Akai WMMAX020TT Washing Machine 20KG", [numeric()])).toEqual([
      { key: "capacity_kg", valueText: null, valueNumeric: 20, unit: "kg" },
    ]);
  });

  it("reads a tonnage spaced from its unit", () => {
    const ton = numeric({
      key: "capacity_ton",
      unitTokens: ["Ton", "T"],
      unit: "ton",
      range: { min: 0.5, max: 6 },
    });
    expect(extractAttributes("Hisense AS24TF2SBBTE00 Split AC 2Ton", [ton])[0]?.valueNumeric).toBe(
      2,
    );
    expect(
      extractAttributes("Super General SGS317I5 Split AC 2.5 Ton", [ton])[0]?.valueNumeric,
    ).toBe(2.5);
  });

  it("ignores a model number that has no unit beside it", () => {
    // 4900 is the model, 302 is the volume. Only the unit separates them.
    const litres = numeric({
      key: "volume_l",
      unitTokens: ["L", "Ltr"],
      unit: "l",
      range: { min: 50, max: 1000 },
    });
    expect(
      extractAttributes("Akai ART4900G TM Refrigerator 302L SLV", [litres])[0]?.valueNumeric,
    ).toBe(302);
  });

  it("records nothing when two plausible magnitudes disagree", () => {
    // A fridge quoting both compartments settles nothing; picking either invents.
    const litres = numeric({
      key: "volume_l",
      unitTokens: ["L"],
      unit: "l",
      range: { min: 50, max: 1000 },
    });
    expect(extractAttributes("Fridge 400L fridge with 100L freezer", [litres])).toEqual([]);
  });

  it("reads a categorical value and respects token boundaries", () => {
    expect(extractAttributes("LG P1460RWN-BW TL SA Washing Machine", [categorical()])).toEqual([
      { key: "load_type", valueText: "top_load", valueNumeric: null, unit: null },
    ]);
    // The same letters inside a model code are not the marker.
    expect(extractAttributes("Bosch WAJ2018SGCTLX Washing Machine", [categorical()])).toEqual([]);
  });

  it("records nothing when a description matches two values of one attribute", () => {
    expect(extractAttributes("Front load and top load combo", [categorical()])).toEqual([]);
  });
});

describe("believing an attribute with nobody to ask", () => {
  const reading = (value: number) => ({
    key: "capacity_kg",
    valueText: null,
    valueNumeric: value,
    unit: "kg",
  });

  it("accepts a dimension whose values sit in a band", () => {
    // Washing machine capacities as they actually appear: repeated and tight.
    const readings = Array.from({ length: 120 }, (_, index) =>
      reading([6, 7, 8, 9, 10][index % 5]!),
    );
    const verdict = judgeAttribute(numeric(), readings, 200);
    expect(verdict.usable).toBe(true);
    expect(verdict.spread).toBeLessThan(20);
  });

  it("accepts a real dimension even when its values almost never repeat", () => {
    // Refrigerator volumes: 100 distinct readings, correct, barely repeating.
    // The rule this replaced rejected exactly this case.
    const litres = numeric({
      key: "volume_l",
      unitTokens: ["L"],
      unit: "l",
      range: { min: 50, max: 1000 },
    });
    const readings = Array.from({ length: 100 }, (_, index) => ({
      key: "volume_l",
      valueText: null,
      valueNumeric: 250 + index * 4,
      unit: "l",
    }));
    const verdict = judgeAttribute(litres, readings, 200);
    expect(verdict.usable).toBe(true);
    expect(verdict.distinctValues).toBe(100);
  });

  it("rejects readings that span orders of magnitude, however often they repeat", () => {
    // Model codes read as a dimension: heavily repeated, and not a measurement.
    const readings = Array.from({ length: 120 }, (_, index) =>
      reading([33, 40, 4400, 2022, 1460][index % 5]!),
    );
    const verdict = judgeAttribute(numeric({ range: { min: 1, max: 9000 } }), readings, 200);
    expect(verdict.usable).toBe(false);
    expect(verdict.reason).toBe("not_a_measurement");
  });

  it("rejects an attribute read from too few of the node's products", () => {
    const readings = Array.from({ length: 40 }, (_, index) => reading(6 + (index % 4)));
    expect(judgeAttribute(numeric(), readings, 1000).reason).toBe("low_coverage");
  });

  it("rejects a sample below the floor any statistic needs", () => {
    const readings = Array.from({ length: 5 }, (_, index) => reading(6 + index));
    expect(judgeAttribute(numeric(), readings, 20).reason).toBe("too_few_readings");
  });

  it("believes a small high-value range when nearly all of it agrees", () => {
    // A motorcycle dealer's entire 650cc line is twenty-three bikes. A threshold
    // sized for an electronics catalogue skipped every model they sell and
    // described their helmets instead.
    const engine = numeric({
      key: "engine_capacity",
      unitTokens: ["cc"],
      unit: "cc",
      range: { min: 100, max: 2000 },
    });
    const readings = Array.from({ length: 20 }, (_, index) => ({
      key: "engine_capacity",
      valueText: null,
      valueNumeric: [349, 443, 452, 648][index % 4]!,
      unit: "cc",
    }));
    expect(judgeAttribute(engine, readings, 23).usable).toBe(true);
  });

  it("holds a small sample to a higher share before believing it", () => {
    // The same twenty readings out of a hundred products are a pattern in a
    // fraction of the node, not a convention the node follows.
    const engine = numeric({
      key: "engine_capacity",
      unitTokens: ["cc"],
      unit: "cc",
      range: { min: 100, max: 2000 },
    });
    const readings = Array.from({ length: 20 }, (_, index) => ({
      key: "engine_capacity",
      valueText: null,
      valueNumeric: [349, 648][index % 2]!,
      unit: "cc",
    }));
    expect(judgeAttribute(engine, readings, 100).reason).toBe("low_coverage");
  });

  it("rejects an attribute every product shares, which narrows nothing", () => {
    const readings = Array.from({ length: 80 }, () => reading(8));
    expect(judgeAttribute(numeric(), readings, 100).reason).toBe("single_value_no_discrimination");
  });
});

describe("contradicting a salesperson", () => {
  const car = (description: string, stock: number) => ({
    itemId: description,
    description,
    nodeKey: "Ford > Sport Utility > Escape",
    stock,
    attributes: [],
  });

  it("does not call a claim false when nothing was checked", () => {
    // The Delaware feed carries fuel type and price as columns the catalogue
    // cannot hold, so a customer asking for a hybrid under $40,000 binds no
    // requirement at all. Every car on the lot then trivially qualifies, and
    // this used to report the salesperson had been wrong — on a shelf count.
    const result = findMissedOpportunity({
      stocked: [car("2025 Ford Escape ST-Line Gas", 1), car("2025 Ford Escape Active Gas", 1)],
      requirements: [],
      spokenNames: [],
      claimedUnavailable: true,
    });
    expect(result.falselyUnavailable).toBe(false);
  });

  it("calls it false only when something checkable was in stock", () => {
    const result = findMissedOpportunity({
      stocked: [
        {
          itemId: "phev",
          description: "2025 Ford Escape PHEV",
          nodeKey: "Ford > Sport Utility > Escape",
          stock: 1,
          attributes: [{ key: "fuel_type", valueText: "hybrid", valueNumeric: null }],
        },
      ],
      requirements: [
        { key: "fuel_type", comparison: "equals", valueText: "hybrid", valueNumeric: null },
      ],
      spokenNames: [],
      claimedUnavailable: true,
    });
    expect(result.falselyUnavailable).toBe(true);
  });
});

describe("a product being several things at once", () => {
  const escape = {
    itemId: "phev",
    description: "Escape",
    nodeKey: "SUVs",
    stock: 1,
    attributes: [
      { key: "known_kind", valueText: "SUV", valueNumeric: null },
      { key: "known_kind", valueText: "plug-in hybrid", valueNumeric: null },
      { key: "known_kind", valueText: "hybrid", valueNumeric: null },
      { key: "fueltype", valueText: "Hybrid Fuel", valueNumeric: null },
      { key: "price_minor", valueText: null, valueNumeric: 3324800 },
    ],
  };

  it("matches on any value the product holds for one attribute", () => {
    // An Escape PHEV is a compact SUV and a plug-in hybrid and a hybrid.
    const result = findMissedOpportunity({
      stocked: [escape],
      requirements: [
        {
          key: "known_kind",
          comparison: "equals",
          valueText: "hybrid",
          valueNumeric: null,
          valueTextAnyOf: ["hybrid", "plug-in hybrid"],
        },
      ],
      spokenNames: [],
      claimedUnavailable: false,
    });
    expect(result.qualifying).toHaveLength(1);
  });

  it("accepts a requirement answered by a corroborating attribute", () => {
    // The dealer's own column and world knowledge record the same fact. Scoring
    // them against each other used to make the requirement vanish.
    const result = findMissedOpportunity({
      stocked: [escape],
      requirements: [
        {
          key: "bodystyle",
          comparison: "equals",
          valueText: "SUVs",
          valueNumeric: null,
          valueTextAnyOf: ["SUVs"],
          alternatives: [{ key: "known_kind", valueTextAnyOf: ["SUV"] }],
        },
      ],
      spokenNames: [],
      claimedUnavailable: false,
    });
    expect(result.qualifying).toHaveLength(1);
  });

  it("does not count the gas model as having shown the hybrid", () => {
    // The dealer feed's description column holds only "Escape", so matching on
    // the model marked every Escape as shown — including the hybrids, which are
    // the cars the customer wanted and never saw.
    const result = findMissedOpportunity({
      stocked: [escape],
      requirements: [],
      spokenNames: ["Ford Escape gas model"],
      claimedUnavailable: false,
      vocabulary: new Map([["fueltype", ["Gas", "Hybrid Fuel", "Electric"]]]),
    });
    expect(result.shown).toHaveLength(0);
    expect(result.neverShown).toHaveLength(1);
  });
});
