import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * From a number on a dashboard to the words that produced it.
 *
 * The chain is metric, cohort, interaction, field value, evidence group,
 * evidence reference, transcript segment. This walks the last three, so a
 * manager reading "19 asked about finance and got no finance offer" can see the
 * customer actually asking.
 *
 * What is returned is the original transcript text, in the language it was
 * spoken. Never a paraphrase and never a translation: the value of evidence is
 * that it is checkable against the recording, and a tidied version of a sentence
 * is no longer the sentence. A field whose evidence failed validation has no
 * evidence group and returns nothing rather than something plausible.
 */

export type EvidenceLine = {
  /** Where in the recording, for the reader to jump to. */
  startMilliseconds: number;
  /** Who was speaking, from the confirmed mapping. */
  role: string;
  /** Exactly as transcribed. */
  text: string;
};

export type FieldEvidence = {
  conversationId: string;
  fieldKey: string;
  /** The extracted value this evidence supports, for context above the quote. */
  valueText: string | null;
  label: string | null;
  lines: EvidenceLine[];
};

/**
 * Evidence for one field across several conversations, in one round trip.
 *
 * Batched because a cohort page shows twenty interactions and a per-row fetch
 * turns that into twenty sequential requests behind a spinner.
 */
export async function evidenceForField(
  organizationId: string,
  conversationIds: readonly string[],
  fieldKeys: readonly string[],
): Promise<Map<string, FieldEvidence[]>> {
  const byConversation = new Map<string, FieldEvidence[]>();
  if (conversationIds.length === 0 || fieldKeys.length === 0) return byConversation;

  const supabase = await createClient();

  const { data: values } = await supabase
    .from("interaction_field_values")
    .select("conversation_id, field_key, label, value_text, evidence_group_id")
    .eq("organization_id", organizationId)
    .in("conversation_id", conversationIds as string[])
    .in("field_key", fieldKeys as string[])
    .is("abstention", null)
    .not("evidence_group_id", "is", null);

  const groups = (values ?? []).flatMap((row) =>
    row.evidence_group_id ? [row.evidence_group_id] : [],
  );
  if (groups.length === 0) return byConversation;

  const { data: references } = await supabase
    .from("evidence_references")
    .select(
      "evidence_group_id, sequence_number, start_milliseconds, transcript_segment_id, transcript_segments(original_text, provider_speaker_identifier)",
    )
    .eq("organization_id", organizationId)
    .in("evidence_group_id", groups)
    .order("sequence_number", { ascending: true });

  // Speaker roles come from the confirmed mapping, so a quote is attributed the
  // same way the record was. Without it a customer's budget could be shown as
  // something the representative said.
  const { data: mappings } = await supabase
    .from("speaker_mapping_entries")
    .select("provider_speaker_identifier, participant_role, speaker_mapping_version_id")
    .eq("organization_id", organizationId);
  const roleFor = new Map(
    (mappings ?? []).map((entry) => [entry.provider_speaker_identifier, entry.participant_role]),
  );

  const linesByGroup = new Map<string, EvidenceLine[]>();
  for (const reference of references ?? []) {
    const segment = reference.transcript_segments as {
      original_text: string;
      provider_speaker_identifier: string | null;
    } | null;
    if (!segment) continue;
    const list = linesByGroup.get(reference.evidence_group_id) ?? [];
    list.push({
      startMilliseconds: reference.start_milliseconds ?? 0,
      role: roleFor.get(segment.provider_speaker_identifier ?? "") ?? "unknown",
      text: segment.original_text,
    });
    linesByGroup.set(reference.evidence_group_id, list);
  }

  for (const row of values ?? []) {
    const lines = linesByGroup.get(row.evidence_group_id ?? "") ?? [];
    if (lines.length === 0) continue;
    const list = byConversation.get(row.conversation_id) ?? [];
    list.push({
      conversationId: row.conversation_id,
      fieldKey: row.field_key,
      valueText: row.value_text,
      label: row.label,
      lines,
    });
    byConversation.set(row.conversation_id, list);
  }

  return byConversation;
}

/** mm:ss for a position in the recording. */
export function timestamp(milliseconds: number): string {
  const total = Math.floor(milliseconds / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
