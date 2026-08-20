import "server-only";

import { createClient } from "@/lib/supabase/server";
import { measure } from "@/modules/intelligence/guardrails";
import { correctionFor, type Correction } from "@/modules/intelligence/corrections";
import {
  computeCoverage,
  currentRecordCandidate,
  type CoverageFieldValue,
  type CoverageRecord,
  type IntelligenceCoverage,
} from "@/modules/intelligence/coverage";
import {
  readEffective,
  type Applicable,
  type Money,
  type Presence,
} from "@/modules/intelligence/effective";
import type { Outcome } from "@/modules/intelligence/outcome";

/**
 * The set of interactions every number on an Intelligence page is drawn from.
 *
 * Assembled once per page and handed to the pure metric functions, so that a
 * page cannot end up with two panels quietly measuring different populations —
 * which is what happens when each component fetches for itself and one of them
 * forgets a filter.
 *
 * One conversation appears exactly once. A conversation that has been
 * re-extracted carries several interaction records, and counting all of them
 * would inflate every rate by however often we happened to reprocess.
 *
 * Read through the cookie client so row level security scopes the result to what
 * the viewer is allowed to see. The organization filter is applied as well as
 * RLS rather than instead of it.
 */

export type PopulationValue = {
  fieldKey: string;
  label: string | null;
  valueText: string | null;
  valueNumber: number | null;
  amountMinor: number | null;
  currency: string | null;
  abstention: string | null;
  hasEvidence: boolean;
  /**
   * Where in the recording this value's earliest citation sits.
   *
   * Carried because some questions are about order, not presence — a close
   * attempt before the customer signalled anything is a different event from one
   * after, and without a timestamp the two are indistinguishable.
   */
  earliestMs: number | null;
};

/**
 * One interaction, already read through the precedence rule.
 *
 * Every analytical field here is the *effective* reading — corrections applied,
 * atomic values preferred, the `interaction_metrics` projection used only where
 * the atomic field was never asked. The raw projection is deliberately not
 * exposed: a component that could reach it would eventually be written to, and
 * a rejected recommendation would then show on the conversation page and not on
 * the dashboard.
 */
export type PopulationRow = {
  conversationId: string;
  recordId: string;
  startedAt: string;
  locationId: string | null;
  representativeMembershipId: string | null;
  teamId: string | null;
  purchaseCategory: string | null;
  arrivalIntent: string | null;
  clarityStart: number | null;
  clarityEnd: number | null;
  /** Every stated target budget, each with the currency it was spoken in. */
  targetBudget: Money[];
  maximumBudget: Money[];
  recommendedCount: number;
  questionCount: number;
  competitorCount: number;
  financeRequested: Presence;
  demo: Applicable;
  alternative: Applicable;
  crossSell: Presence;
  upsell: Presence;
  outcome: Outcome;
  values: PopulationValue[];
};

export type PopulationFilters = {
  organizationId: string;
  from: string;
  to: string;
  locationId?: string | null;
  purchaseCategory?: string | null;
  representativeMembershipId?: string | null;
  teamId?: string | null;
};

/**
 * How complete the picture is, so a page can say what it could not see.
 *
 * `withoutMetrics` is the honest gap: conversations that were analysed but whose
 * metrics never landed cannot contribute to a rate, and silently dropping them
 * would make every denominator quietly smaller than the floor the manager
 * remembers walking.
 */
export type PopulationSummary = {
  rows: PopulationRow[];
  /** How much of the floor we can see, computed from the same reads. */
  coverage: IntelligenceCoverage;
  conversationsInPeriod: number;
  /**
   * Analysed conversations that could not be included. Null where a category is
   * selected, because an unanalysed conversation has no category yet and cannot
   * honestly be counted as missing from one.
   */
  withoutMetrics: number | null;
  /** Every category in the authorized slice, before category narrowing. */
  availableCategories: string[];
  /** True where a human correction was applied to at least one value. */
  correctionsApplied: number;
};

// Written as single literals rather than assembled from parts: the Supabase
// client infers the row type from the select string, and a concatenated one
// types every column as an error object instead.
const METRIC_COLUMNS =
  "interaction_record_id, conversation_id, started_at, purchase_category, arrival_intent, clarity_start, clarity_end, target_budget_minor, max_budget_minor, budget_currency, products_recommended_count, objection_count, objection_coverage, competitor_count, finance_requested, demo_performed, alternative_offered, cross_sell_count, upsell_count, customer_question_count";

// `id` is selected because a correction is keyed to the value it corrects.
const VALUE_COLUMNS =
  "id, interaction_record_id, field_key, label, value_text, value_number, value_amount_minor, currency_code, abstention, evidence_group_id";

function clarityToNumber(level: string | number | null): number | null {
  if (level === null) return null;
  if (typeof level === "number") return level;
  const scale: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
  return scale[level] ?? null;
}

/** One page of the field-value read; the API will not return more at once. */
const VALUE_PAGE_SIZE = 1000;

/**
 * The only fields whose position in the recording is ever asked about.
 *
 * Close-after-commitment is a question about order, so both sides of it need a
 * timestamp. Nothing else on these pages does — a use case is counted, not
 * placed — and reading a citation time for every value of every field was the
 * single most expensive thing the loader did.
 */
const CHRONOLOGICAL_FIELDS = new Set(["customer_commitment_signals", "close_attempts"]);

type FieldValueRow = {
  id: string;
  interaction_record_id: string;
  field_key: string;
  label: string | null;
  value_text: string | null;
  value_number: number | null;
  amountMinorRaw?: never;
  value_amount_minor: number | null;
  currency_code: string | null;
  abstention: string | null;
  evidence_group_id: string | null;
};

async function readAllFieldValues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  recordIds: readonly string[],
): Promise<FieldValueRow[]> {
  const all: FieldValueRow[] = [];
  for (let offset = 0; ; offset += VALUE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("interaction_field_values")
      .select(VALUE_COLUMNS)
      .eq("organization_id", organizationId)
      .in("interaction_record_id", recordIds)
      // Ordered so the pages partition the set rather than overlapping, which
      // an unordered paged read does not guarantee.
      .order("id", { ascending: true })
      .range(offset, offset + VALUE_PAGE_SIZE - 1);
    if (error) throw new Error(`Interaction field values could not be read: ${error.message}`);
    const page = (data ?? []) as unknown as FieldValueRow[];
    all.push(...page);
    if (page.length < VALUE_PAGE_SIZE) return all;
  }
}

const EMPTY_COVERAGE: IntelligenceCoverage = {
  recordedInteractions: 0,
  recordingFiles: 0,
  recordingHours: 0,
  recordingDurationUnavailableFiles: 0,
  transcription: { completed: 0, inProgress: 0, failed: 0, cancelled: 0, notStarted: 0 },
  transcribedInteractions: 0,
  analysis: { completed: 0, inProgress: 0, failed: 0, cancelled: 0, notStarted: 0 },
  analysedInteractions: 0,
  usableInteractions: 0,
  notUsableInteractions: 0,
  outcomeKnown: measure(0, 0, 0),
  outcomeFieldAvailable: 0,
  evidenceReady: measure(0, 0, 0),
  usableConversationIds: [],
  currentRecordIdByConversation: new Map(),
};

export async function loadPopulation(filters: PopulationFilters): Promise<PopulationSummary> {
  const supabase = await createClient();

  // Conversations first, because the dimension filters (store, rep, team) live
  // there and applying them here keeps the record and metric reads small.
  let conversationQuery = supabase
    .from("conversations")
    .select(
      "id, started_at, location_id, representative_membership_id, team_id, active_transcription_run_id",
    )
    .eq("organization_id", filters.organizationId)
    .gte("started_at", filters.from)
    .lt("started_at", filters.to);
  if (filters.locationId)
    conversationQuery = conversationQuery.eq("location_id", filters.locationId);
  if (filters.representativeMembershipId) {
    conversationQuery = conversationQuery.eq(
      "representative_membership_id",
      filters.representativeMembershipId,
    );
  }
  if (filters.teamId) conversationQuery = conversationQuery.eq("team_id", filters.teamId);
  if (filters.representativeMembershipId) {
    conversationQuery = conversationQuery.eq(
      "representative_membership_id",
      filters.representativeMembershipId,
    );
  }

  const { data: conversations, error: conversationsError } = await conversationQuery;
  // A failed read and an empty period are indistinguishable once both become
  // an empty array, and the second is a normal Tuesday. Left unchecked, an
  // outage renders as "0 interactions analysed" — a confident, wrong answer
  // that nobody would think to question.
  if (conversationsError) {
    throw new Error(`Conversations could not be read: ${conversationsError.message}`);
  }
  const conversationIds = (conversations ?? []).map((row) => row.id);
  if (conversationIds.length === 0) {
    return {
      rows: [],
      coverage: EMPTY_COVERAGE,
      conversationsInPeriod: 0,
      withoutMetrics: 0,
      availableCategories: [],
      correctionsApplied: 0,
    };
  }
  const dimensions = new Map(
    (conversations ?? []).map((row) => [
      row.id,
      {
        // The conversation's own clock. interaction_metrics carries a timestamp
        // too, but that one moves when a record is reprocessed — binning a trend
        // on it would move a March conversation into August because we happened
        // to re-run extraction.
        startedAt: row.started_at,
        locationId: row.location_id,
        representativeMembershipId: row.representative_membership_id,
        teamId: row.team_id,
      },
    ]),
  );

  // Everything Coverage needs, read once and shared with the population. The
  // two must agree by construction: a page that says "26 usable" and then
  // computes its rates over a different 31 is telling a manager two things.
  const [
    { data: recordings, error: recordingsError },
    { data: runs, error: runsError },
    { data: records, error: recordsError },
    { data: definitions, error: definitionsError },
  ] = await Promise.all([
    supabase
      .from("recordings")
      .select("conversation_id, status, duration_milliseconds")
      .eq("organization_id", filters.organizationId)
      .in("conversation_id", conversationIds),
    supabase
      .from("transcription_runs")
      .select("id, conversation_id, status")
      .eq("organization_id", filters.organizationId)
      .in("conversation_id", conversationIds),
    supabase
      .from("interaction_records")
      .select("id, conversation_id, source_transcription_run_id, status, completed_at, created_at")
      .eq("organization_id", filters.organizationId)
      .in("conversation_id", conversationIds),
    supabase
      .from("interaction_field_definitions")
      .select("key, is_system, is_enabled, requires_evidence")
      .eq("organization_id", filters.organizationId),
  ]);
  if (recordingsError) throw new Error(`Recordings could not be read: ${recordingsError.message}`);
  if (runsError) throw new Error(`Transcription runs could not be read: ${runsError.message}`);
  if (recordsError) {
    throw new Error(`Interaction records could not be read: ${recordsError.message}`);
  }
  if (definitionsError) {
    throw new Error(`Field definitions could not be read: ${definitionsError.message}`);
  }

  const coverageRecords: CoverageRecord[] = (records ?? []).map((record) => ({
    id: record.id,
    conversationId: record.conversation_id,
    sourceTranscriptionRunId: record.source_transcription_run_id,
    status: record.status,
    completedAt: record.completed_at,
    createdAt: record.created_at,
  }));

  // The candidate record per conversation, tied to the active transcription
  // run. Re-transcribing retires every record built from the previous audio.
  const candidateIds = (conversations ?? []).flatMap((conversation) => {
    const candidate = currentRecordCandidate(
      coverageRecords.filter((record) => record.conversationId === conversation.id),
      conversation.active_transcription_run_id,
    );
    return candidate ? [candidate.id] : [];
  });

  const [candidateValues, { data: candidateCorrections, error: correctionsError }] =
    candidateIds.length > 0
      ? await Promise.all([
          readAllFieldValues(supabase, filters.organizationId, candidateIds),
          supabase
            .from("interaction_field_value_corrections")
            .select("field_value_id, corrected_text, is_rejected, created_at")
            .eq("organization_id", filters.organizationId)
            .in("interaction_record_id", candidateIds)
            .order("created_at", { ascending: false }),
        ])
      : [[] as FieldValueRow[], { data: [], error: null }];
  if (correctionsError) {
    throw new Error(`Corrections could not be read: ${correctionsError.message}`);
  }

  const corrections: Correction[] = (candidateCorrections ?? []).map((row) => ({
    fieldValueId: row.field_value_id,
    correctedText: row.corrected_text,
    isRejected: row.is_rejected,
    createdAt: row.created_at,
  }));

  // Evidence groups on fields that are required to cite something, so Coverage
  // can tell a fact that pointed at the current transcript from one that
  // pointed at a transcript this record was not built from.
  const evidenceGroupIds = [
    ...new Set(
      candidateValues.flatMap((row) => (row.evidence_group_id ? [row.evidence_group_id] : [])),
    ),
  ];
  const evidencePages = await Promise.all(
    Array.from({ length: Math.ceil(evidenceGroupIds.length / 200) }, (_, index) =>
      supabase
        .from("evidence_references")
        .select("evidence_group_id, transcription_run_id, start_milliseconds")
        .eq("organization_id", filters.organizationId)
        .in("evidence_group_id", evidenceGroupIds.slice(index * 200, index * 200 + 200)),
    ),
  );
  const evidenceRows: {
    evidence_group_id: string;
    transcription_run_id: string;
    start_milliseconds: number | null;
  }[] = [];
  for (const { data, error } of evidencePages) {
    if (error) throw new Error(`Evidence references could not be read: ${error.message}`);
    evidenceRows.push(...(data ?? []));
  }

  const coverageValues: CoverageFieldValue[] = candidateValues.map((row) => {
    const applied = correctionFor(row.id, corrections);
    return {
      interactionRecordId: row.interaction_record_id,
      fieldKey: row.field_key,
      valueText: applied.kind === "corrected" ? applied.text : row.value_text,
      abstention: row.abstention,
      evidenceGroupId: row.evidence_group_id,
      rejected: applied.kind === "rejected",
    };
  });

  const coverage = computeCoverage({
    conversations: (conversations ?? []).map((row) => ({
      id: row.id,
      activeTranscriptionRunId: row.active_transcription_run_id,
    })),
    recordings: (recordings ?? []).map((row) => ({
      conversationId: row.conversation_id,
      status: row.status,
      durationMilliseconds: row.duration_milliseconds,
    })),
    runs: (runs ?? []).map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      status: row.status,
    })),
    records: coverageRecords,
    fieldValues: coverageValues,
    definitions: (definitions ?? []).map((row) => ({
      key: row.key,
      isSystem: row.is_system,
      isEnabled: row.is_enabled,
      requiresEvidence: row.requires_evidence,
    })),
    evidenceReferences: evidenceRows.map((row) => ({
      evidenceGroupId: row.evidence_group_id,
      transcriptionRunId: row.transcription_run_id,
    })),
  });

  // The analytical population is exactly the usable interactions.
  const recordIds = [...coverage.currentRecordIdByConversation.values()];
  if (recordIds.length === 0) {
    return {
      rows: [],
      coverage,
      conversationsInPeriod: conversationIds.length,
      withoutMetrics: coverage.notUsableInteractions,
      availableCategories: [],
      correctionsApplied: 0,
    };
  }

  // Every usable record's projection, unnarrowed. Category is applied only
  // after the effective rows exist: filtering on `interaction_metrics` first
  // meant a category a manager had corrected was invisible to the filter, and
  // the selector was built from the stale projection too.
  const { data: metrics, error: metricsError } = await supabase
    .from("interaction_metrics")
    .select(METRIC_COLUMNS)
    .eq("organization_id", filters.organizationId)
    .in("interaction_record_id", recordIds);
  if (metricsError)
    throw new Error(`Interaction metrics could not be read: ${metricsError.message}`);
  const metricRows = metrics ?? [];

  const includedRecordIds = new Set(metricRows.map((row) => row.interaction_record_id));
  // Already read once, for Coverage. Reading the same values a second time to
  // build the same rows would double the cost of every page for nothing.
  const fieldValues = candidateValues.filter((row) =>
    includedRecordIds.has(row.interaction_record_id),
  );
  const allCorrections = corrections;

  // Earliest citation per evidence group, so a value can be placed in the
  // conversation rather than only counted. Only for the fields whose metric
  // depends on order; everything else is counted, never placed.
  const earliest = new Map<string, number>();
  for (const reference of evidenceRows) {
    const at = reference.start_milliseconds ?? 0;
    const seen = earliest.get(reference.evidence_group_id);
    if (seen === undefined || at < seen) earliest.set(reference.evidence_group_id, at);
  }

  const valuesByRecord = new Map<string, PopulationValue[]>();
  let correctionsApplied = 0;
  for (const row of fieldValues) {
    const applied = correctionFor(row.id, allCorrections);
    if (applied.kind !== "kept") correctionsApplied += 1;
    const list = valuesByRecord.get(row.interaction_record_id) ?? [];
    // A rejected value leaves the metrics but not the record. Dropping the row
    // outright made the field look as though it had never been extracted, and
    // an unsupported field falls back to the conversation-level projection —
    // so rejecting a wrong category brought the old category straight back,
    // over the manager's correction. It stays as an abstention instead: the
    // field was asked, and what it said is no longer trusted.
    list.push({
      fieldKey: row.field_key,
      label: row.label,
      valueText:
        applied.kind === "corrected"
          ? applied.text
          : applied.kind === "rejected"
            ? null
            : row.value_text,
      valueNumber:
        applied.kind === "rejected" || row.value_number === null ? null : Number(row.value_number),
      amountMinor:
        applied.kind === "rejected" || row.value_amount_minor === null
          ? null
          : Number(row.value_amount_minor),
      currency: row.currency_code,
      abstention: applied.kind === "rejected" ? "rejected_by_reviewer" : row.abstention,
      hasEvidence: row.evidence_group_id !== null,
      earliestMs:
        row.evidence_group_id && CHRONOLOGICAL_FIELDS.has(row.field_key)
          ? (earliest.get(row.evidence_group_id) ?? null)
          : null,
    });
    valuesByRecord.set(row.interaction_record_id, list);
  }

  // Every effective row, before any category narrowing.
  const allRows: PopulationRow[] = metricRows.map((row) => {
    const values = valuesByRecord.get(row.interaction_record_id) ?? [];
    const dimension = dimensions.get(row.conversation_id);
    const effective = readEffective(values, {
      purchaseCategory: row.purchase_category,
      arrivalIntent: row.arrival_intent,
      clarityStart: clarityToNumber(row.clarity_start),
      clarityEnd: clarityToNumber(row.clarity_end),
      targetBudgetMinor: row.target_budget_minor === null ? null : Number(row.target_budget_minor),
      maxBudgetMinor: row.max_budget_minor === null ? null : Number(row.max_budget_minor),
      budgetCurrency: row.budget_currency,
      productsRecommendedCount: row.products_recommended_count ?? 0,
      competitorCount: row.competitor_count ?? 0,
      customerQuestionCount: row.customer_question_count ?? 0,
      financeRequested: Boolean(row.finance_requested),
      demoPerformed: row.demo_performed,
      alternativeOffered: row.alternative_offered,
    });
    return {
      conversationId: row.conversation_id,
      recordId: row.interaction_record_id,
      startedAt: dimension?.startedAt ?? row.started_at,
      locationId: dimension?.locationId ?? null,
      representativeMembershipId: dimension?.representativeMembershipId ?? null,
      teamId: dimension?.teamId ?? null,
      ...effective,
      values,
    };
  });

  // Options come from the corrected values, so a category a manager fixed is
  // the category the selector offers.
  const availableCategories = [
    ...new Set(allRows.flatMap((row) => (row.purchaseCategory ? [row.purchaseCategory] : []))),
  ].sort();

  const rows = filters.purchaseCategory
    ? allRows.filter((row) => row.purchaseCategory === filters.purchaseCategory)
    : allRows;

  // Analysed but not usable: every value abstained or rejected, so there is
  // nothing to count. Null where a category is selected, because an unusable
  // interaction has no category and cannot honestly be counted as missing from
  // one.
  const withoutMetrics = filters.purchaseCategory ? null : coverage.notUsableInteractions;

  return {
    rows,
    coverage,
    conversationsInPeriod: conversationIds.length,
    withoutMetrics,
    availableCategories,
    correctionsApplied,
  };
}
