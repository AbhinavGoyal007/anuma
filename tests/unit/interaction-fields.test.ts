import { describe, expect, it } from "vitest";

import {
  atomicField,
  atomicFieldKeys,
  atomicFields,
  extractedFields,
  systemFields,
} from "@/modules/interaction-record/fields";
import { normalizeLabel } from "@/modules/interaction-record/extraction-contract";
import { sourceClasses } from "@/modules/interaction-record/source-class";

/**
 * The registry is the contract every other part of the record derives from —
 * the extraction schema, the persistence shape, the grounding validator and the
 * evaluation harness. A field that drifts here drifts everywhere, silently, so
 * the invariants are pinned rather than assumed.
 */

describe("the atomic field registry", () => {
  it("holds the canonical set", () => {
    // 43 = the guide's 40, minus the two laptop-only fields (portability,
    // battery), plus the one category-adaptive field that replaced them, plus
    // cross-sell, upsell, red-flags and customer questions added for
    // rep-execution and category-architecture intelligence.
    // Changes here are deliberate: the schema stays stable so records stay
    // comparable, and a field is added on purpose or not at all.
    expect(atomicFields).toHaveLength(43);
    expect(atomicFieldKeys).toHaveLength(43);
  });

  it("carries no laptop-specific requirement fields", () => {
    // These do not generalise past electronics; category-specific needs live in
    // additional_requirements instead.
    expect(atomicFieldKeys).not.toContain("portability_requirement");
    expect(atomicFieldKeys).not.toContain("battery_requirement");
  });

  it("has a category-adaptive requirement field that carries a dimension label", () => {
    const field = atomicField("additional_requirements");
    expect(field.labelled).toBe(true);
    expect(field.cardinality).toBe("multiple");
    expect(field.rule).toMatch(/snake_case/i);
  });

  it("has no duplicate keys", () => {
    expect(new Set(atomicFieldKeys).size).toBe(atomicFieldKeys.length);
  });

  it("keeps the registry and the key list in step", () => {
    expect(atomicFields.map((field) => field.key)).toEqual([...atomicFieldKeys]);
  });

  it("gives every field a known source class", () => {
    for (const field of atomicFields) {
      expect(sourceClasses).toContain(field.sourceClass);
      if (field.alternateSourceClass) {
        expect(sourceClasses).toContain(field.alternateSourceClass);
        expect(field.alternateSourceClass).not.toBe(field.sourceClass);
      }
    }
  });

  it("gives every enum field its permitted values", () => {
    for (const field of atomicFields) {
      if (field.valueKind === "enum") {
        expect(field.values, `${field.key} is an enum with no values`).toBeDefined();
        expect(field.values!.length).toBeGreaterThan(1);
      }
    }
  });

  it("explains the rule for every field", () => {
    for (const field of atomicFields) {
      expect(field.rule.length, `${field.key} has no rule`).toBeGreaterThan(10);
    }
  });
});

describe("what the model is allowed to produce", () => {
  it("never asks the model for a fact the system already owns", () => {
    // Identity and clock come from auth, roster and device. A model guessing a
    // store id would be inventing provenance.
    for (const key of [
      "conversation_id",
      "store_id",
      "rep_id",
      "started_at",
      "ended_at",
    ] as const) {
      expect(atomicField(key).extracted).toBe(false);
      expect(atomicField(key).sourceClass).toBe("verified");
    }
  });

  it("never asks the model for the commercial outcome", () => {
    // Whether money changed hands is a POS fact. Reading it from the
    // conversation is exactly the attribution this product must not manufacture.
    const outcome = atomicField("commercial_outcome");
    expect(outcome.extracted).toBe(false);
    expect(outcome.sourceClass).toBe("verified");
  });

  it("splits cleanly into extracted and system-supplied", () => {
    expect(extractedFields.length + systemFields.length).toBe(43);
    expect(systemFields).toHaveLength(6);
  });

  it("requires evidence for everything read out of the conversation", () => {
    for (const field of extractedFields) {
      if (field.sourceClass === "evidence_extracted" || field.sourceClass === "evaluated") {
        // stock_status is the one extracted field whose authority is inventory,
        // not the transcript, so a spoken claim is a fallback rather than proof.
        if (field.key === "stock_status") continue;
        expect(field.requiresEvidence, `${field.key} may be stated without evidence`).toBe(true);
      }
    }
  });
});

describe("rules the guide is explicit about", () => {
  it("keeps target and maximum budget as separate facts", () => {
    // A ceiling must be stated, never derived from the opening figure.
    expect(atomicField("target_budget").valueKind).toBe("money");
    expect(atomicField("maximum_budget").valueKind).toBe("money");
    expect(atomicField("maximum_budget").rule).toMatch(/never infer/i);
  });

  it("treats a competitor price as a claim, not a price", () => {
    const claim = atomicField("competitor_price_claim");
    expect(claim.key).toBe("competitor_price_claim");
    expect(claim.sourceClass).toBe("evidence_extracted");
    expect(claim.rule).toMatch(/claim/i);
    // There must be no field asserting a verified competitor price.
    expect(atomicFieldKeys).not.toContain("competitor_price");
  });

  it("prefers the inventory system for stock status", () => {
    const stock = atomicField("stock_status");
    expect(stock.sourceClass).toBe("verified");
    expect(stock.alternateSourceClass).toBe("evidence_extracted");
  });

  it("allows a quoted price to come from either the system or the transcript", () => {
    const quoted = atomicField("store_price_quoted");
    expect(quoted.sourceClass).toBe("evidence_extracted");
    expect(quoted.alternateSourceClass).toBe("verified");
  });

  it("measures requirement clarity at both ends so progress is computable", () => {
    // Requirement Clarification Progress is a proprietary metric candidate and
    // needs both endpoints; one without the other makes it uncomputable.
    expect(atomicField("requirement_clarity_start").values).toEqual(
      atomicField("requirement_clarity_end").values,
    );
  });

  it("judges rather than reads the facts that need a rubric", () => {
    for (const key of [
      "arrival_intent_state",
      "requirement_origin",
      "requirement_clarity_start",
      "requirement_clarity_end",
      "decision_drivers",
      "objection_response",
      "alternative_offered",
      "final_decision_state",
    ] as const) {
      expect(atomicField(key).sourceClass, `${key} should be evaluated`).toBe("evaluated");
    }
  });

  it("keeps one object per objection rather than merging concerns", () => {
    expect(atomicField("objections").cardinality).toBe("multiple");
    expect(atomicField("objection_response").cardinality).toBe("multiple");
  });

  it("separates what was weighed from what was pitched", () => {
    expect(atomicField("products_considered").cardinality).toBe("multiple");
    expect(atomicField("products_recommended").cardinality).toBe("multiple");
  });
});

describe("normalizeLabel", () => {
  it("coerces model wording into the snake_case the column requires", () => {
    expect(normalizeLabel("Floor Preference")).toBe("floor_preference");
    expect(normalizeLabel("battery life")).toBe("battery_life");
    expect(normalizeLabel("fuel-type")).toBe("fuel_type");
  });

  it("strips leading non-letters and trailing underscores", () => {
    // The exact failure that killed a whole record: a label the strict pattern
    // rejected. Now it is repaired instead of thrown away.
    expect(normalizeLabel("1BHK")).toBe("bhk");
    expect(normalizeLabel("  Location  ")).toBe("location");
  });

  it("returns null when nothing usable remains", () => {
    expect(normalizeLabel(null)).toBeNull();
    expect(normalizeLabel("123")).toBeNull();
    expect(normalizeLabel("!!!")).toBeNull();
  });
});
