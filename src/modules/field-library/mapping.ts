import type { Database } from "@/lib/supabase/database.generated";
import type { ExtractionField } from "@/modules/interaction-record/extraction-contract";
import type { Cardinality, ValueKind } from "@/modules/interaction-record/fields";
import type { SourceClass } from "@/modules/interaction-record/source-class";

/**
 * Translations between the stored row, the shape the settings page renders, and
 * the shape the extractor needs. Kept in one place so the column names live at a
 * single boundary rather than being restated by every caller.
 */

export type FieldDefinitionRow = Pick<
  Database["public"]["Tables"]["interaction_field_definitions"]["Row"],
  | "id"
  | "key"
  | "label"
  | "definition"
  | "source_class"
  | "alternate_source_class"
  | "value_kind"
  | "cardinality"
  | "enum_values"
  | "labelled"
  | "requires_evidence"
  | "is_system"
  | "is_enabled"
  | "sort_order"
  | "task"
  | "scope"
  | "speaker_source"
>;

/** A definition as the page shows it — the row, nothing derived. */
export type FieldDefinition = {
  id: string;
  key: string;
  label: string;
  definition: string;
  sourceClass: SourceClass;
  valueKind: ValueKind;
  cardinality: Cardinality;
  enumValues: string[];
  labelled: boolean;
  requiresEvidence: boolean;
  isSystem: boolean;
  isEnabled: boolean;
  sortOrder: number;
};

export function rowToDefinition(row: FieldDefinitionRow): FieldDefinition {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    definition: row.definition,
    sourceClass: row.source_class as SourceClass,
    valueKind: row.value_kind as ValueKind,
    cardinality: row.cardinality as Cardinality,
    enumValues: row.enum_values ?? [],
    labelled: row.labelled,
    requiresEvidence: row.requires_evidence,
    isSystem: row.is_system,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
  };
}

/**
 * A definition as the extractor needs it.
 *
 * `values` is undefined rather than an empty array for non-enum fields, and
 * `labelled` defaults to false, so a row mapped here is contract-equivalent to
 * the static registry field it was seeded from.
 */
export function rowToExtractionField(row: FieldDefinitionRow): ExtractionField {
  return {
    key: row.key,
    sourceClass: row.source_class as SourceClass,
    alternateSourceClass: (row.alternate_source_class as SourceClass | null) ?? undefined,
    cardinality: row.cardinality as Cardinality,
    valueKind: row.value_kind as ValueKind,
    values: row.enum_values && row.enum_values.length > 0 ? row.enum_values : undefined,
    labelled: row.labelled,
    requiresEvidence: row.requires_evidence,
    // Undefined rather than null where a row predates these columns, so an
    // older library still builds the same prompt as the static registry.
    task: (row.task as ExtractionField["task"] | null) ?? undefined,
    scope: (row.scope as ExtractionField["scope"] | null) ?? undefined,
    speakerSource: (row.speaker_source as ExtractionField["speakerSource"] | null) ?? undefined,
    rule: row.definition,
  };
}
