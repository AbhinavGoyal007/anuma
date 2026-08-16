import { extractedFields } from "@/modules/interaction-record/fields";
import type { SourceClass } from "@/modules/interaction-record/source-class";

/**
 * The default field library, derived from the static registry.
 *
 * The registry (`fields.ts`) stays the single source of the defaults: this turns
 * each extracted field into the row a new organization is seeded with, so the
 * two can never drift. An organization edits its copy afterwards; the registry
 * is only where everyone starts.
 */

export type FieldDefinitionSeed = {
  key: string;
  label: string;
  definition: string;
  source_class: SourceClass;
  alternate_source_class: SourceClass | null;
  value_kind: string;
  cardinality: string;
  enum_values: string[];
  labelled: boolean;
  requires_evidence: boolean;
  task: string | null;
  scope: string | null;
  speaker_source: string | null;
  is_system: boolean;
  is_enabled: boolean;
  sort_order: number;
};

/** "purchase_use_cases" → "Purchase use cases": a readable default display name. */
export function labelFromKey(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function defaultFieldDefinitions(): FieldDefinitionSeed[] {
  return extractedFields.map((field, index) => ({
    key: field.key,
    label: labelFromKey(field.key),
    definition: field.rule,
    source_class: field.sourceClass,
    alternate_source_class: field.alternateSourceClass ?? null,
    value_kind: field.valueKind,
    cardinality: field.cardinality,
    enum_values: field.values ? [...field.values] : [],
    labelled: field.labelled ?? false,
    requires_evidence: field.requiresEvidence,
    task: field.task ?? null,
    scope: field.scope ?? null,
    speaker_source: field.speakerSource ?? null,
    // Every seeded field is canonical: identity protected, disable-not-delete.
    is_system: true,
    is_enabled: true,
    sort_order: index,
  }));
}
