import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  correctionFor,
  currentRecordIds,
  type Correction,
} from "@/modules/intelligence/corrections";
import { readOutcome, type Outcome } from "@/modules/intelligence/outcome";

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
  targetBudgetMinor: number | null;
  maxBudgetMinor: number | null;
  budgetCurrency: string | null;
  productsRecommendedCount: number;
  objectionCount: number;
  objectionCoverage: number | null;
  competitorCount: number;
  financeRequested: boolean;
  demoPerformed: string | null;
  alternativeOffered: string | null;
  crossSellCount: number;
  upsellCount: number;
  customerQuestionCount: number;
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
  conversationsInPeriod: number;
  withoutMetrics: number;
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
    const { data } = await supabase
      .from("interaction_field_values")
      .select(VALUE_COLUMNS)
      .eq("organization_id", organizationId)
      .in("interaction_record_id", recordIds)
      // Ordered so the pages partition the set rather than overlapping, which
      // an unordered paged read does not guarantee.
      .order("id", { ascending: true })
      .range(offset, offset + VALUE_PAGE_SIZE - 1);
    const page = (data ?? []) as unknown as FieldValueRow[];
    all.push(...page);
    if (page.length < VALUE_PAGE_SIZE) return all;
  }
}

export async function loadPopulation(filters: PopulationFilters): Promise<PopulationSummary> {
  const supabase = await createClient();

  // Conversations first, because the dimension filters (store, rep, team) live
  // there and applying them here keeps the record and metric reads small.
  let conversationQuery = supabase
    .from("conversations")
    .select("id, location_id, representative_membership_id, team_id")
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

  const { data: conversations } = await conversationQuery;
  const conversationIds = (conversations ?? []).map((row) => row.id);
  if (conversationIds.length === 0) {
    return { rows: [], conversationsInPeriod: 0, withoutMetrics: 0, correctionsApplied: 0 };
  }
  const dimensions = new Map(
    (conversations ?? []).map((row) => [
      row.id,
      {
        locationId: row.location_id,
        representativeMembershipId: row.representative_membership_id,
        teamId: row.team_id,
      },
    ]),
  );

  // The current record per conversation: most recently completed wins.
  const { data: records } = await supabase
    .from("interaction_records")
    .select("id, conversation_id, created_at")
    .eq("organization_id", filters.organizationId)
    .eq("status", "completed")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  const recordIds = currentRecordIds(
    (records ?? []).map((record) => ({
      id: record.id,
      conversationId: record.conversation_id,
      createdAt: record.created_at,
    })),
  );
  if (recordIds.length === 0) {
    return {
      rows: [],
      conversationsInPeriod: conversationIds.length,
      withoutMetrics: conversationIds.length,
      correctionsApplied: 0,
    };
  }

  let metricsQuery = supabase
    .from("interaction_metrics")
    .select(METRIC_COLUMNS)
    .eq("organization_id", filters.organizationId)
    .in("interaction_record_id", recordIds);
  if (filters.purchaseCategory) {
    metricsQuery = metricsQuery.eq("purchase_category", filters.purchaseCategory);
  }
  const { data: metrics } = await metricsQuery;
  const metricRows = metrics ?? [];
  if (metricRows.length === 0) {
    return {
      rows: [],
      conversationsInPeriod: conversationIds.length,
      withoutMetrics: conversationIds.length,
      correctionsApplied: 0,
    };
  }

  const includedRecordIds = metricRows.map((row) => row.interaction_record_id);

  const [fieldValues, { data: corrections }] = await Promise.all([
    // Paged deliberately. The API caps a select at a thousand rows, and a
    // period of sixty interactions carries roughly three thousand field values,
    // so a single request silently returns a third of the data — with no error,
    // and with every rate on the page quietly computed against whichever
    // records happened to fall inside the first page.
    readAllFieldValues(supabase, filters.organizationId, includedRecordIds),
    // The original model value is immutable; a correction sits beside it. Only
    // the newest correction per value counts, and a rejection removes the value
    // from every metric rather than merely flagging it.
    supabase
      .from("interaction_field_value_corrections")
      .select("field_value_id, corrected_text, is_rejected, created_at")
      .eq("organization_id", filters.organizationId)
      .in("interaction_record_id", includedRecordIds)
      .order("created_at", { ascending: false }),
  ]);

  // Earliest citation per evidence group, so a value can be placed in the
  // conversation rather than only counted.
  const groupIds = [
    ...new Set(
      (fieldValues ?? []).flatMap((row) => (row.evidence_group_id ? [row.evidence_group_id] : [])),
    ),
  ];
  const earliest = new Map<string, number>();
  for (let offset = 0; offset < groupIds.length; offset += 200) {
    const { data } = await supabase
      .from("evidence_references")
      .select("evidence_group_id, start_milliseconds")
      .eq("organization_id", filters.organizationId)
      .in("evidence_group_id", groupIds.slice(offset, offset + 200));
    for (const reference of data ?? []) {
      const at = reference.start_milliseconds ?? 0;
      const seen = earliest.get(reference.evidence_group_id);
      if (seen === undefined || at < seen) earliest.set(reference.evidence_group_id, at);
    }
  }

  const allCorrections: Correction[] = (corrections ?? []).map((row) => ({
    fieldValueId: row.field_value_id,
    correctedText: row.corrected_text,
    isRejected: row.is_rejected,
    createdAt: row.created_at,
  }));

  const valuesByRecord = new Map<string, PopulationValue[]>();
  let correctionsApplied = 0;
  for (const row of fieldValues) {
    const applied = correctionFor(row.id, allCorrections);
    if (applied.kind === "rejected") {
      correctionsApplied += 1;
      continue;
    }
    if (applied.kind === "corrected") correctionsApplied += 1;
    const list = valuesByRecord.get(row.interaction_record_id) ?? [];
    list.push({
      fieldKey: row.field_key,
      label: row.label,
      valueText: applied.kind === "corrected" ? applied.text : row.value_text,
      valueNumber: row.value_number === null ? null : Number(row.value_number),
      amountMinor: row.value_amount_minor === null ? null : Number(row.value_amount_minor),
      currency: row.currency_code,
      abstention: row.abstention,
      hasEvidence: row.evidence_group_id !== null,
      earliestMs: row.evidence_group_id ? (earliest.get(row.evidence_group_id) ?? null) : null,
    });
    valuesByRecord.set(row.interaction_record_id, list);
  }

  const rows: PopulationRow[] = metricRows.map((row) => {
    const values = valuesByRecord.get(row.interaction_record_id) ?? [];
    const dimension = dimensions.get(row.conversation_id);
    return {
      conversationId: row.conversation_id,
      recordId: row.interaction_record_id,
      startedAt: row.started_at,
      locationId: dimension?.locationId ?? null,
      representativeMembershipId: dimension?.representativeMembershipId ?? null,
      teamId: dimension?.teamId ?? null,
      purchaseCategory: row.purchase_category,
      arrivalIntent: row.arrival_intent,
      clarityStart: clarityToNumber(row.clarity_start),
      clarityEnd: clarityToNumber(row.clarity_end),
      targetBudgetMinor: row.target_budget_minor === null ? null : Number(row.target_budget_minor),
      maxBudgetMinor: row.max_budget_minor === null ? null : Number(row.max_budget_minor),
      budgetCurrency: row.budget_currency,
      productsRecommendedCount: row.products_recommended_count ?? 0,
      objectionCount: row.objection_count ?? 0,
      objectionCoverage: row.objection_coverage === null ? null : Number(row.objection_coverage),
      competitorCount: row.competitor_count ?? 0,
      financeRequested: Boolean(row.finance_requested),
      demoPerformed: row.demo_performed,
      alternativeOffered: row.alternative_offered,
      crossSellCount: row.cross_sell_count ?? 0,
      upsellCount: row.upsell_count ?? 0,
      customerQuestionCount: row.customer_question_count ?? 0,
      outcome: readOutcome(values),
      values,
    };
  });

  return {
    rows,
    conversationsInPeriod: conversationIds.length,
    withoutMetrics: conversationIds.length - rows.length,
    correctionsApplied,
  };
}
