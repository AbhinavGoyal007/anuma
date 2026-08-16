import { describe, expect, it } from "vitest";

import { defaultFieldDefinitions } from "@/modules/field-library/defaults";
import { rowToExtractionField, type FieldDefinitionRow } from "@/modules/field-library/mapping";
import {
  buildExtractionJsonSchema,
  buildExtractionSystemPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  extractionJsonSchema,
  type ExtractionField,
} from "@/modules/interaction-record/extraction-contract";
import { groundValues } from "@/modules/interaction-record/grounding";

/**
 * The safety net for making the field set editable: an organization that has
 * not touched its library must extract exactly as before. The defaults are
 * seeded into the database and read back as rows, so these run the seed through
 * that round-trip and assert the resulting contract is byte-for-byte the static
 * one. If a future edit to the seed or the mapping breaks this, existing records
 * would silently start coming out differently — which this catches.
 */

/** Seed rows → the stored row shape → the extractor's field, as the DB path does. */
function seededExtractionFields(): ExtractionField[] {
  return defaultFieldDefinitions().map((seed, index) => {
    const row: FieldDefinitionRow = {
      id: `row-${index}`,
      key: seed.key,
      label: seed.label,
      definition: seed.definition,
      source_class: seed.source_class,
      alternate_source_class: seed.alternate_source_class,
      value_kind: seed.value_kind,
      cardinality: seed.cardinality,
      enum_values: seed.enum_values,
      labelled: seed.labelled,
      requires_evidence: seed.requires_evidence,
      is_system: seed.is_system,
      is_enabled: seed.is_enabled,
      sort_order: seed.sort_order,
      task: seed.task,
      scope: seed.scope,
      speaker_source: seed.speaker_source,
    };
    return rowToExtractionField(row);
  });
}

describe("default field library reproduces the static contract", () => {
  it("builds the identical system prompt", () => {
    expect(buildExtractionSystemPrompt(seededExtractionFields())).toBe(EXTRACTION_SYSTEM_PROMPT);
  });

  it("builds the identical JSON schema", () => {
    expect(buildExtractionJsonSchema(seededExtractionFields())).toEqual(extractionJsonSchema);
  });

  it("keeps stock_status as the only no-evidence exception named in the prompt", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain(
      "Every value except stock_status must cite evidenceSegmentIds",
    );
  });
});

describe("a custom field flows through the dynamic contract", () => {
  const custom: ExtractionField = {
    key: "wall_mount_interest",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    rule: "Whether the customer asks about wall-mounting the television.",
  };

  it("appears in the schema enum and the field guide", () => {
    const schema = buildExtractionJsonSchema([custom]);
    const fieldEnum = schema.properties.values.items.properties.field.enum;
    expect(fieldEnum).toEqual(["wall_mount_interest"]);
    expect(buildExtractionSystemPrompt([custom])).toContain(
      "- wall_mount_interest [EVIDENCE_EXTRACTED, SCOPE FULL, one entry per instance, use valueText]:",
    );
  });

  it("is a known field to grounding when the field set includes it", () => {
    const value = {
      field: "wall_mount_interest",
      valueText: "asked if it can be wall mounted",
      valueNumber: null,
      amountMajor: null,
      amountScale: null,
      currency: null,
      attributedTo: null,
      label: null,
      evidenceSegmentIds: ["seg-1"],
      abstention: null,
    };
    const result = groundValues([value], new Set(["seg-1"]), [custom]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("is rejected as unknown when the field set does not include it", () => {
    const value = {
      field: "wall_mount_interest",
      valueText: "asked if it can be wall mounted",
      valueNumber: null,
      amountMajor: null,
      amountScale: null,
      currency: null,
      attributedTo: null,
      label: null,
      evidenceSegmentIds: ["seg-1"],
      abstention: null,
    };
    const result = groundValues([value], new Set(["seg-1"]));
    expect(result.rejected[0]?.reason).toBe("unknown_field");
  });
});
