import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  INTERACTION_METRICS_VERSION,
  computeInteractionMetrics,
  type MetricInputValue,
} from "@/modules/interaction-metrics/compute";

/**
 * Computes and stores the metrics row for one interaction record.
 *
 * Reads the facts back from the database rather than taking them in memory, so
 * the same function serves a fresh build and a backfill, and always measures
 * exactly what was persisted. Idempotent: recomputing replaces the row in place
 * at the current formula version.
 */
export async function storeInteractionMetrics(interactionRecordId: string): Promise<void> {
  const db = createAdminClient();

  const { data: record, error: recordError } = await db
    .from("interaction_records")
    .select("id, organization_id, conversation_id")
    .eq("id", interactionRecordId)
    .maybeSingle();
  if (recordError || !record) throw new Error("Interaction record not found for metrics.");

  // The slicing dimensions live on the conversation; copied onto the metrics row
  // so the dashboard never joins to answer a store/category/time question.
  const { data: conversation } = await db
    .from("conversations")
    .select("location_id, team_id, vertical, started_at")
    .eq("id", record.conversation_id)
    .single();
  if (!conversation) throw new Error("Conversation not found for metrics.");

  const { data: rows, error: valuesError } = await db
    .from("interaction_field_values")
    .select("field_key, value_text, value_number, value_amount_minor, currency_code, abstention")
    .eq("interaction_record_id", interactionRecordId);
  if (valuesError) throw new Error("Field values could not be read for metrics.");

  const values: MetricInputValue[] = (rows ?? []).map((row) => ({
    fieldKey: row.field_key,
    valueText: row.value_text,
    valueNumber: row.value_number === null ? null : Number(row.value_number),
    amountMinor: row.value_amount_minor === null ? null : Number(row.value_amount_minor),
    currency: row.currency_code,
    abstention: row.abstention,
  }));

  const m = computeInteractionMetrics(values);
  const purchaseCategory =
    values.find((v) => v.fieldKey === "purchase_category" && v.abstention === null)?.valueText ??
    null;

  const { error: upsertError } = await db.from("interaction_metrics").upsert(
    {
      organization_id: record.organization_id,
      conversation_id: record.conversation_id,
      interaction_record_id: interactionRecordId,
      algorithm_version: INTERACTION_METRICS_VERSION,

      location_id: conversation.location_id,
      team_id: conversation.team_id,
      vertical: conversation.vertical,
      started_at: conversation.started_at,
      purchase_category: purchaseCategory,

      arrival_intent: m.arrivalIntent,
      decision_state: m.decisionState,
      clarity_start: m.clarityStart,
      clarity_end: m.clarityEnd,
      clarity_delta: m.clarityDelta,
      target_budget_minor: m.targetBudgetMinor,
      max_budget_minor: m.maxBudgetMinor,
      budget_currency: m.budgetCurrency,
      use_case_count: m.useCaseCount,
      requirement_count: m.requirementCount,
      products_considered_count: m.productsConsideredCount,
      products_recommended_count: m.productsRecommendedCount,
      objection_count: m.objectionCount,
      objection_coverage: m.objectionCoverage,
      alternative_offered: m.alternativeOffered,
      competitor_count: m.competitorCount,
      price_gap: m.priceGap,
      price_gap_basis: m.priceGapBasis,
      finance_requested: m.financeRequested,
      promotion_discussed: m.promotionDiscussed,
      demo_performed: m.demoPerformed,
      cross_sell_count: m.crossSellCount,
      upsell_count: m.upsellCount,
      red_flag_count: m.redFlagCount,
      customer_question_count: m.customerQuestionCount,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "interaction_record_id" },
  );
  if (upsertError)
    throw new Error(`Interaction metrics could not be saved: ${upsertError.message}`);
}
