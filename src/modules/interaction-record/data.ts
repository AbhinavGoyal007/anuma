import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AbstentionReason, SourceClass } from "@/modules/interaction-record/source-class";

/**
 * Reads a conversation's Commercial Interaction Record for display.
 *
 * Goes through the cookie-authenticated client rather than the admin client, so
 * row level security decides what the viewer may see. A value is returned with
 * its resolved amount, its spoken form and its source class, because the screen
 * has to show all three: the number that aggregates, the words a manager checks
 * against the audio, and how much the number can be trusted.
 *
 * Which fields exist, what they are called and the order they read in all come
 * from the organization's field library, not the static registry — so a custom
 * tag a business added shows up here exactly like a standard field, and a value
 * is never dropped just because its key is not in the code's original list.
 */

/** A person's override of an extracted value: the right value, or a rejection. */
export type RecordCorrection = {
  correctedText: string | null;
  isRejected: boolean;
  note: string | null;
  createdAt: string;
};

export type RecordFieldValue = {
  /** The stored value's id — what a correction targets. */
  valueId: string;
  fieldKey: string;
  /** The field's display name, from the field library; falls back to the key. */
  displayLabel: string;
  sourceClass: SourceClass;
  abstention: AbstentionReason | null;
  valueText: string | null;
  valueNumber: number | null;
  spokenAmount: number | null;
  spokenScale: string | null;
  amountMinor: number | null;
  currency: string | null;
  attributedTo: string | null;
  label: string | null;
  hasEvidence: boolean;
  /** The current human correction for this value, if any; original stays above. */
  correction: RecordCorrection | null;
};

export type InteractionRecord = {
  id: string;
  status: string;
  model: string;
  schemaVersion: string;
  rejectedValueCount: number;
  createdAt: string;
  /** A short narrative recap of the interaction, generated from the facts. */
  summary: string | null;
  values: RecordFieldValue[];
};

export async function getInteractionRecord(
  conversationId: string,
): Promise<InteractionRecord | null> {
  const supabase = await createClient();

  const { data: record } = await supabase
    .from("interaction_records")
    .select(
      "id, organization_id, status, model, schema_version, rejected_value_count, created_at, summary",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!record) return null;

  const [{ data: values }, { data: definitions }, { data: corrections }] = await Promise.all([
    supabase
      .from("interaction_field_values")
      .select(
        "id, field_key, source_class, abstention, value_text, value_number, spoken_amount, spoken_scale, value_amount_minor, currency_code, attributed_to, label, evidence_group_id",
      )
      .eq("interaction_record_id", record.id),
    supabase
      .from("interaction_field_definitions")
      .select("key, label, sort_order")
      .eq("organization_id", record.organization_id),
    supabase
      .from("interaction_field_value_corrections")
      .select("field_value_id, corrected_text, is_rejected, note, created_at")
      .eq("interaction_record_id", record.id)
      .order("created_at", { ascending: false }),
  ]);

  // The library gives each field its display name and its place in the order.
  // A value whose field is no longer defined (a deleted custom tag) still shows,
  // labelled from its key and sorted to the end, rather than vanishing.
  const labelByKey = new Map((definitions ?? []).map((d) => [d.key, d.label]));
  const orderByKey = new Map((definitions ?? []).map((d) => [d.key, d.sort_order]));

  // The most recent correction per value is the current one; the table is
  // ordered newest-first, so the first seen wins.
  const correctionByValue = new Map<string, RecordCorrection>();
  for (const row of corrections ?? []) {
    if (!correctionByValue.has(row.field_value_id)) {
      correctionByValue.set(row.field_value_id, {
        correctedText: row.corrected_text,
        isRejected: row.is_rejected,
        note: row.note,
        createdAt: row.created_at,
      });
    }
  }

  const mapped: RecordFieldValue[] = (values ?? [])
    .map((value) => ({
      valueId: value.id,
      fieldKey: value.field_key,
      displayLabel: labelByKey.get(value.field_key) ?? value.field_key.replaceAll("_", " "),
      sourceClass: value.source_class as SourceClass,
      abstention: value.abstention as AbstentionReason | null,
      valueText: value.value_text,
      valueNumber: value.value_number === null ? null : Number(value.value_number),
      spokenAmount: value.spoken_amount === null ? null : Number(value.spoken_amount),
      spokenScale: value.spoken_scale,
      amountMinor: value.value_amount_minor === null ? null : Number(value.value_amount_minor),
      currency: value.currency_code,
      attributedTo: value.attributed_to,
      label: value.label,
      hasEvidence: value.evidence_group_id !== null,
      correction: correctionByValue.get(value.id) ?? null,
    }))
    // Read in the library's order, so the record always reads the same way — who
    // arrived, what they needed, what was offered, how it ended — with custom
    // tags following the standard fields.
    .sort(
      (a, b) =>
        (orderByKey.get(a.fieldKey) ?? Number.MAX_SAFE_INTEGER) -
        (orderByKey.get(b.fieldKey) ?? Number.MAX_SAFE_INTEGER),
    );

  return {
    id: record.id,
    status: record.status,
    model: record.model,
    schemaVersion: record.schema_version,
    rejectedValueCount: record.rejected_value_count,
    createdAt: record.created_at,
    summary: record.summary,
    values: mapped,
  };
}
