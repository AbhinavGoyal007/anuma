import "server-only";

import { amountToMinor } from "@/modules/analysis/amount-scale";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.generated";
import { resolveExtractionFields } from "@/modules/field-library/repository";
import {
  extractInteractionRecord,
  type RecordSegment,
} from "@/modules/interaction-record/extractor";
import type { ExtractedValue } from "@/modules/interaction-record/extraction-contract";
import { deriveOutcomeBasis } from "@/modules/interaction-record/outcome-basis";
import type { SourceClass } from "@/modules/interaction-record/source-class";
import { generateInteractionSummary, type SummaryFact } from "@/modules/interaction-record/summary";
import { storeInteractionMetrics } from "@/modules/interaction-metrics/persistence";

/**
 * Builds and stores the Commercial Interaction Record for a conversation.
 *
 * Runs after transcription and speaker mapping, because a record whose speakers
 * are unassigned cannot say who wanted what — and "the customer's budget" and
 * "the representative's quote" are different facts that happen to be numbers.
 */

/** Bumped whenever the field registry or extraction rules change materially. */
export const RECORD_SCHEMA_VERSION = "cir.v1";

/**
 * The payload the persistence function expects.
 *
 * Money is sent twice: as it was spoken, and resolved into minor units. The
 * spoken form is the evidence a reviewer checks against the audio; the resolved
 * form is what aggregates sum. Keeping only the second would leave "35 lakh"
 * unverifiable, and keeping only the first would make every total wrong.
 */
/**
 * The one value the system fills in rather than reads: which evidence settled
 * the business outcome. Written alongside the extracted values so the record is
 * complete in one place, and left out entirely when no outcome was established.
 */
function outcomeBasisPayload(values: readonly ExtractedValue[]): Record<string, unknown>[] {
  const basis = deriveOutcomeBasis(values);
  if (!basis) return [];
  return [
    {
      field: "outcome_basis",
      sourceClass: "verified" satisfies SourceClass,
      abstention: null,
      valueText: basis,
      valueNumber: null,
      spokenAmount: null,
      spokenScale: null,
      amountMinor: null,
      currency: null,
      attributedTo: null,
      label: null,
      evidenceSegmentIds: [],
    },
  ];
}

/** Whether a payload satisfies the value-or-abstention rule the table enforces. */
function isStorable(payload: Record<string, unknown>): boolean {
  if (payload.abstention) return true;
  const text = payload.valueText;
  return (
    (typeof text === "string" && text.trim().length > 0) ||
    payload.valueNumber !== null ||
    payload.amountMinor !== null
  );
}

function toPayload(
  value: ExtractedValue,
  sourceClassByKey: ReadonlyMap<string, SourceClass>,
): Record<string, unknown> {
  return {
    field: value.field,
    // The source class comes from the organization's own field, not the static
    // registry, so a business's custom tags persist with the right provenance.
    sourceClass: sourceClassByKey.get(value.field) ?? "evidence_extracted",
    abstention: value.abstention,
    valueText: value.valueText,
    valueNumber: value.valueNumber,
    spokenAmount: value.amountMajor,
    spokenScale: value.amountScale,
    amountMinor: amountToMinor(value.amountMajor, value.amountScale, value.currency),
    currency: value.currency,
    attributedTo: value.attributedTo,
    label: value.label,
    evidenceSegmentIds: value.evidenceSegmentIds,
  };
}

/** The present facts as summary input: one readable value per extracted value. */
function summaryFactsFromAccepted(values: readonly ExtractedValue[]): SummaryFact[] {
  const facts: SummaryFact[] = [];
  for (const value of values) {
    if (value.abstention) continue;
    let rendered: string | null = null;
    if (value.amountMajor !== null) {
      // The resolved amount reads cleanly ("90,000 INR"); the spoken form
      // ("90 unit") is only the fallback when a scale cannot be applied.
      const minor = amountToMinor(value.amountMajor, value.amountScale, value.currency);
      rendered =
        minor !== null && value.currency
          ? `${Math.round(minor / 100).toLocaleString("en-IN")} ${value.currency}`
          : [value.amountMajor, value.amountScale, value.currency].filter(Boolean).join(" ");
    } else if (value.valueNumber !== null) {
      rendered = String(value.valueNumber);
    } else if (value.valueText) {
      rendered = value.valueText;
    }
    if (!rendered) continue;
    facts.push({
      label: value.label ? `${value.field} (${value.label})` : value.field,
      value: rendered,
    });
  }
  return facts;
}

export type BuildResult = {
  recordId: string;
  persistedValues: number;
  rejectedValues: number;
  alreadyPersisted: boolean;
};

export async function buildInteractionRecord(conversationId: string): Promise<BuildResult> {
  "use step";

  const db = createAdminClient();

  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .select(
      "id, organization_id, vertical, active_transcription_run_id, active_speaker_mapping_version_id",
    )
    .eq("id", conversationId)
    .single();
  if (conversationError || !conversation) throw new Error("The interaction was not found.");
  if (!conversation.active_transcription_run_id) {
    throw new Error("A transcript is required before an interaction record can be built.");
  }
  if (!conversation.active_speaker_mapping_version_id) {
    // Without knowing who spoke, a budget cannot be attributed to the customer
    // and a quote cannot be attributed to the representative.
    throw new Error("A confirmed speaker mapping is required.");
  }

  const [{ data: organization }, { data: segments }, { data: mappings }] = await Promise.all([
    db
      .from("organizations")
      .select("country_code, default_currency")
      .eq("id", conversation.organization_id)
      .single(),
    db
      .from("transcript_segments")
      .select("id, start_milliseconds, original_text, provider_speaker_identifier")
      .eq("transcription_run_id", conversation.active_transcription_run_id)
      .order("sequence_number"),
    db
      .from("speaker_mapping_entries")
      .select("provider_speaker_identifier, participant_role")
      .eq("speaker_mapping_version_id", conversation.active_speaker_mapping_version_id),
  ]);

  if (!organization) throw new Error("The organization context could not be read.");
  if (!segments?.length) throw new Error("The transcript has no segments.");

  // The organization's own field library defines what is extracted. Resolved
  // here so the schema, prompt and grounding all speak to the same field set,
  // and so the source class each value persists under comes from that field.
  const fields = await resolveExtractionFields(conversation.organization_id);
  const sourceClassByKey = new Map(fields.map((field) => [field.key, field.sourceClass]));

  const roles = new Map(
    (mappings ?? []).map((entry) => [entry.provider_speaker_identifier, entry.participant_role]),
  );
  const recordSegments: RecordSegment[] = segments.map((segment) => ({
    id: segment.id,
    role: roles.get(segment.provider_speaker_identifier ?? "") ?? "unknown",
    startMilliseconds: segment.start_milliseconds,
    text: segment.original_text,
  }));

  const { data: record, error: recordError } = await db
    .from("interaction_records")
    .insert({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      source_transcription_run_id: conversation.active_transcription_run_id,
      speaker_mapping_version_id: conversation.active_speaker_mapping_version_id,
      model: "pending",
      schema_version: RECORD_SCHEMA_VERSION,
      status: "running",
    })
    .select("id")
    .single();
  if (recordError || !record) throw new Error("The interaction record could not be opened.");

  try {
    const extraction = await extractInteractionRecord({
      vertical: conversation.vertical,
      country: organization.country_code,
      currency: organization.default_currency,
      segments: recordSegments,
      fields,
    });

    const payloads = [
      ...extraction.grounded.accepted.map((value) => toPayload(value, sourceClassByKey)),
      ...outcomeBasisPayload(extraction.grounded.accepted),
    ];
    // A row must carry a value or an abstention; the database enforces it, and
    // the whole insert is one transaction. A spoken amount whose scale will not
    // convert clears every value column and leaves such a row behind, so it is
    // dropped here rather than allowed to take sixty good values down with it.
    const storable = payloads.filter(isStorable);
    const unstorable = payloads.length - storable.length;

    const { data: persisted, error: persistError } = await db
      .rpc("persist_interaction_record", {
        p_record_id: record.id,
        p_values: storable as unknown as Json,
      })
      .single();
    if (persistError) throw new Error(persistError.message);

    await db
      .from("interaction_records")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        input_tokens: extraction.inputTokens,
        output_tokens: extraction.outputTokens,
        rejected_value_count: extraction.grounded.rejected.length + unstorable,
      })
      .eq("id", record.id);

    // The metrics are derived from the facts just written, so they are computed
    // here rather than left for a later pass — a completed record and its
    // measures land together.
    await storeInteractionMetrics(record.id);

    // The narrative recap is best-effort: written from the facts just persisted,
    // and never allowed to fail a completed record if the model call stumbles.
    try {
      const summary = await generateInteractionSummary({
        facts: summaryFactsFromAccepted(extraction.grounded.accepted),
        vertical: conversation.vertical,
        country: organization.country_code,
        currency: organization.default_currency,
      });
      if (summary) {
        await db
          .from("interaction_records")
          .update({ summary: summary.summary })
          .eq("id", record.id);
      }
    } catch (error) {
      console.error("Interaction summary could not be generated", {
        recordId: record.id,
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    return {
      recordId: record.id,
      persistedValues: persisted?.persisted_values ?? 0,
      rejectedValues: extraction.grounded.rejected.length,
      alreadyPersisted: persisted?.already_persisted ?? false,
    };
  } catch (error) {
    // A record left `running` forever is indistinguishable from one still in
    // flight, so failures are closed out with their reason attached.
    await db
      .from("interaction_records")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: (error instanceof Error ? error.message : "Extraction failed.").slice(
          0,
          500,
        ),
      })
      .eq("id", record.id);
    throw error;
  }
}
