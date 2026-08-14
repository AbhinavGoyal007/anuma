import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  clusterObjection,
  clusterThemes,
  clusterTiming,
} from "@/modules/interaction-metrics/clustering";
import {
  classifyBuyingBehaviour,
  summarizeBehaviour,
  type BehaviourMix,
  type CategoryRole,
} from "@/modules/interaction-metrics/buying-behaviour";
import {
  normalizeCategoryPhrase,
  resolveSpokenCategories,
  type SpokenMappingStatus,
} from "@/modules/interaction-metrics/category-grouping";
import {
  computeDecisionHierarchy,
  decisionDimensionFor,
  type DecisionAppearance,
  type DecisionFilter,
} from "@/modules/interaction-metrics/decision-hierarchy";
import {
  computeDemandLeakage,
  type DemandLeakage,
  type LeakageInput,
} from "@/modules/interaction-metrics/leakage";

/**
 * Demand intelligence, aggregated across conversations.
 *
 * Reads through the cookie-authenticated client so row level security scopes
 * everything to the viewer's organization — the aggregate can only ever cover
 * conversations they may see. Everything is counted from stored facts and
 * metrics; no model runs here, per the guide's rule that code, not an LLM,
 * produces an executive number.
 *
 * A conversation can be re-extracted, leaving several records behind it, so a
 * single current record per conversation is chosen first. Skipping that would
 * count the same conversation two or three times and quietly inflate every
 * total.
 */

export type IntelligenceFilters = {
  vertical?: string;
  /** A single store (location). Omitted means the whole organization. */
  locationId?: string;
  /** ISO timestamp; only conversations at or after this are counted. */
  since?: string;
};

/**
 * The default rolling window. Demand intelligence is inherently a "what are
 * customers wanting lately" question, and an unbounded all-time scan gets slower
 * and less useful with every conversation. Bounding it also caps the largest
 * scan — the current-record selection — so the read path stays flat as history
 * grows. Callers can override via `filters.since`.
 */
export const DEFAULT_WINDOW_DAYS = 90;

export type Distribution = { key: string; count: number };
export type LabeledDimension = { key: string; count: number; example: string | null };
export type ShadowPrice = { product: string; median: number; count: number; currency: string };
export type Band = { key: string; count: number };

/**
 * How much of the window the category grouping actually accounts for.
 *
 * Grouping by a confirmed mapping means some interactions have no category to
 * sit in — either because nobody has confirmed what the customer's phrasing
 * meant, or because it named something outside the range ANUMA covers. Both are
 * reported rather than dropped: a category breakdown that silently omits a third
 * of the window is worse than one that says so.
 */
export type CategoryCoverage = {
  /** Interactions counted into a category. */
  resolved: number;
  /** Interactions whose phrasing is confirmed as outside the covered range. */
  outsideRange: number;
  /** Interactions whose phrasing nobody has confirmed a meaning for yet. */
  unresolved: number;
  /** Those phrasings, so the gap can be closed rather than merely noted. */
  unresolvedPhrases: Distribution[];
};

export type DemandIntelligence = {
  conversations: number;
  /** The rolling window these figures cover, so the view can state it plainly. */
  windowDays: number;

  // Headline pulse.
  purchased: number;
  followUp: number;
  clarityImproved: { improved: number; measured: number };

  // (1) What customers want.
  /** Recurring topics across every free-text field, by conversations touching each. */
  themes: Distribution[];
  /** What customers keep asking — the playbook's architecture failure points. */
  questionTopics: LabeledDimension[];
  /** The order decision filters surface, earliest first. */
  decisionHierarchy: DecisionFilter[];
  /** Observed buying behaviour per category, against the role the business set. */
  behaviour: BehaviourMix[];
  /** What the category breakdown above does and does not account for. */
  categoryCoverage: CategoryCoverage;
  useCases: Distribution[];
  brands: Distribution[];
  requirementDimensions: LabeledDimension[];
  budgetBands: Band[];
  budget: { median: number | null; currency: string | null; count: number };
  urgency: Distribution[];

  // (2) Did we understand them — the clarification journey.
  clarityStart: Distribution[];
  clarityEnd: Distribution[];

  // (3) Competitive pressure.
  competitors: Distribution[];
  competitorProducts: Distribution[];
  shadowPrices: ShadowPrice[];
  priceGap: { median: number | null; basis: "claimed" | null; count: number };
  competitorMentionRate: number;

  // (4) Where and why demand leaks.
  /** The funnel: where commercially viable demand disappeared. */
  leakage: DemandLeakage;
  objectionClusters: Distribution[];
  lostDemand: { count: number; topReason: string | null };
  /** Moments flagged for review: how often, and the category breakdown. */
  redFlagRate: number | null;
  redFlagCategories: Distribution[];

  // (5) How well we sold.
  objectionCoverage: number | null;
  alternativeOfferRate: number | null;
  demoRate: number | null;
  crossSellRate: number | null;
  upsellRate: number | null;
  financeInterest: number;
  productsConsidered: Distribution[];
  productsRecommended: Distribution[];
  decisionStates: Distribution[];
  arrivalIntents: Distribution[];
};

function tally(labels: readonly (string | null)[]): Distribution[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function median(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function mean(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

const CLARITY_LABEL = ["none", "low", "medium", "high"] as const;

/**
 * Adaptive budget bands.
 *
 * Fixed rupee brackets break the moment laptops (₹65k) and property (₹35 lakh)
 * share a chart, so the bands are cut from the data itself — the terciles of the
 * budgets present — and labelled with the real rupee ranges. Meaningful within a
 * store or category, which is where budgets are actually comparable.
 */
function budgetBands(minorValues: readonly number[], currency: string): Band[] {
  if (minorValues.length < 3) {
    return minorValues.map((v) => ({ key: formatRupees(v, currency), count: 1 }));
  }
  const sorted = [...minorValues].sort((a, b) => a - b);
  const lower = sorted[Math.floor(sorted.length / 3)]!;
  const upper = sorted[Math.floor((2 * sorted.length) / 3)]!;
  const bands: Band[] = [
    { key: `under ${formatRupees(lower, currency)}`, count: 0 },
    { key: `${formatRupees(lower, currency)} – ${formatRupees(upper, currency)}`, count: 0 },
    { key: `over ${formatRupees(upper, currency)}`, count: 0 },
  ];
  for (const v of sorted) {
    if (v < lower) bands[0]!.count += 1;
    else if (v < upper) bands[1]!.count += 1;
    else bands[2]!.count += 1;
  }
  return bands.filter((b) => b.count > 0);
}

function formatRupees(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(minor / 100);
}

export async function getDemandIntelligence(
  organizationId: string,
  filters: IntelligenceFilters = {},
): Promise<DemandIntelligence> {
  const supabase = await createClient();

  // The rolling window. Passed explicitly by a caller, or the default. A record
  // is created no earlier than its conversation started, so bounding the record
  // scan by created_at never drops a conversation whose start is in the window —
  // it only trims the candidates the precise started_at cut then works over.
  const windowDays = DEFAULT_WINDOW_DAYS;
  const since =
    filters.since ?? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // The current record for each conversation: the most recent completed one.
  // organization_id is filtered explicitly so the planner prunes to this tenant
  // before RLS runs; RLS still enforces the finer per-viewer scope on top.
  const recordQuery = supabase
    .from("interaction_records")
    .select("id, conversation_id, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  const { data: allRecords } = await recordQuery;

  const currentByConversation = new Map<string, string>();
  for (const record of allRecords ?? []) {
    if (!currentByConversation.has(record.conversation_id)) {
      currentByConversation.set(record.conversation_id, record.id);
    }
  }
  const currentRecordIds = [...currentByConversation.values()];
  if (currentRecordIds.length === 0) return emptyIntelligence(windowDays);

  // Metrics for those records, with the dimension filters applied.
  let metricsQuery = supabase
    .from("interaction_metrics")
    .select(
      "interaction_record_id, conversation_id, decision_state, arrival_intent, target_budget_minor, budget_currency, objection_coverage, objection_count, alternative_offered, competitor_count, price_gap, price_gap_basis, clarity_start, clarity_end, finance_requested, demo_performed, cross_sell_count, upsell_count, red_flag_count, products_recommended_count, products_considered_count, vertical, started_at",
    )
    .eq("organization_id", organizationId)
    .in("interaction_record_id", currentRecordIds)
    .gte("started_at", since);
  if (filters.vertical)
    metricsQuery = metricsQuery.eq("vertical", filters.vertical as "electronics" | "automotive");
  if (filters.locationId) metricsQuery = metricsQuery.eq("location_id", filters.locationId);
  const { data: metrics } = await metricsQuery;

  const rows = metrics ?? [];
  if (rows.length === 0) return emptyIntelligence(windowDays);

  // Every fact for the surviving records, keyed so it can be attributed to its
  // conversation for the pairings (a competitor's product with its claimed
  // price, a lost conversation with its objection).
  const includedRecordIds = rows.map((r) => r.interaction_record_id);
  const { data: fieldValues } = await supabase
    .from("interaction_field_values")
    .select(
      "conversation_id, field_key, value_text, value_amount_minor, currency_code, label, evidence_group_id",
    )
    .eq("organization_id", organizationId)
    .in("interaction_record_id", includedRecordIds)
    .is("abstention", null);
  const fv = fieldValues ?? [];
  const byField = (key: string) => fv.filter((v) => v.field_key === key);

  const budgetCurrency = rows.find((r) => r.budget_currency)?.budget_currency ?? "INR";
  const budgets = rows
    .map((r) => (r.target_budget_minor === null ? null : Number(r.target_budget_minor)))
    .filter((n): n is number => n !== null);
  const coverages = rows
    .map((r) => (r.objection_coverage === null ? null : Number(r.objection_coverage)))
    .filter((n): n is number => n !== null);
  const priceGaps = rows
    .map((r) => (r.price_gap === null ? null : Number(r.price_gap)))
    .filter((n): n is number => n !== null);

  const alternativeEligible = rows.filter(
    (r) => r.alternative_offered === "yes" || r.alternative_offered === "no",
  );
  const demoMeasured = rows.filter((r) => r.demo_performed === "yes" || r.demo_performed === "no");

  const clarityMeasured = rows.filter((r) => r.clarity_start !== null && r.clarity_end !== null);
  const clarityImproved = clarityMeasured.filter(
    (r) => (r.clarity_end ?? 0) > (r.clarity_start ?? 0),
  ).length;

  // Requirement dimensions: the category-adaptive field, grouped by the aspect
  // it describes, with one real value kept as an example.
  const dimensionMap = new Map<string, { count: number; example: string | null }>();
  for (const v of byField("additional_requirements")) {
    if (!v.label) continue;
    const entry = dimensionMap.get(v.label) ?? { count: 0, example: null };
    entry.count += 1;
    entry.example ??= v.value_text;
    dimensionMap.set(v.label, entry);
  }
  const requirementDimensions = [...dimensionMap.entries()]
    .map(([key, { count, example }]) => ({ key, count, example }))
    .sort((a, b) => b.count - a.count);

  // Shadow prices: what customers say a competitor charges, paired with the
  // product they named for it inside the same conversation.
  const priceClaimsByConversation = new Map<string, { product: string; amount: number }[]>();
  for (const v of byField("competitor_price_claim")) {
    if (v.value_amount_minor === null) continue;
    const product =
      fv.find(
        (p) => p.conversation_id === v.conversation_id && p.field_key === "competitor_product",
      )?.value_text ?? "unspecified product";
    const list = priceClaimsByConversation.get(v.conversation_id) ?? [];
    list.push({ product, amount: Number(v.value_amount_minor) });
    priceClaimsByConversation.set(v.conversation_id, list);
  }
  const shadowByProduct = new Map<string, number[]>();
  for (const list of priceClaimsByConversation.values()) {
    for (const { product, amount } of list) {
      const prices = shadowByProduct.get(product) ?? [];
      prices.push(amount);
      shadowByProduct.set(product, prices);
    }
  }
  const shadowPrices: ShadowPrice[] = [...shadowByProduct.entries()]
    .map(([product, prices]) => ({
      product,
      median: median(prices)!,
      count: prices.length,
      currency: budgetCurrency,
    }))
    .sort((a, b) => b.count - a.count);

  // Why demand leaked: conversations that did not convert, and the objection
  // that most often accompanied them.
  const lostStates = new Set(["deferred", "rejected", "researching"]);
  const lostConversationIds = new Set(
    rows
      .filter((r) => r.decision_state && lostStates.has(r.decision_state))
      .map((r) => r.conversation_id),
  );
  const lostObjections = byField("objections")
    .filter((v) => lostConversationIds.has(v.conversation_id))
    .map((v) => clusterObjection(v.value_text));
  const lostReasonRanked = tally(lostObjections);

  // Themes: recurring topics across every free-text field, counted by the number
  // of conversations that touch each — a conversation raising a theme in three
  // fields still counts once, so this reads as "how many customers brought it up".
  const themeFields = new Set([
    "purchase_use_cases",
    "additional_requirements",
    "specification_requirements",
    "decision_drivers",
    "objections",
    "recommendation_reasons",
    "other_constraints",
    "initial_request",
  ]);
  const themesByConversation = new Map<string, Set<string>>();
  for (const v of fv) {
    if (!themeFields.has(v.field_key)) continue;
    const matched = clusterThemes(v.value_text);
    if (matched.length === 0) continue;
    const set = themesByConversation.get(v.conversation_id) ?? new Set<string>();
    for (const theme of matched) set.add(theme);
    themesByConversation.set(v.conversation_id, set);
  }
  const themeCounts = new Map<string, number>();
  for (const set of themesByConversation.values()) {
    for (const theme of set) themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }
  const themes = [...themeCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  // The leakage funnel. The signals the metrics row does not carry — an explicit
  // stockout, a stated timeframe, a price or financing objection — are read from
  // the facts and keyed by conversation so each interaction walks the funnel once.
  const stockedOut = new Set(
    byField("stock_status")
      .filter((v) => v.value_text === "unavailable")
      .map((v) => v.conversation_id),
  );
  const statedTiming = new Set(byField("purchase_timing").map((v) => v.conversation_id));
  const priceBlocked = new Set(
    byField("objections")
      .filter((v) => {
        const cluster = clusterObjection(v.value_text);
        return cluster === "price / budget" || cluster === "finance / EMI";
      })
      .map((v) => v.conversation_id),
  );
  const decidedIntents = new Set(["comparing", "specific_product", "ready_to_buy"]);
  const leakageInputs: LeakageInput[] = rows.map((r) => ({
    purchased: r.decision_state === "purchased",
    hasIntentSignal:
      decidedIntents.has(r.arrival_intent ?? "") ||
      r.target_budget_minor !== null ||
      statedTiming.has(r.conversation_id),
    clarityEnd: r.clarity_end,
    stockUnavailable: stockedOut.has(r.conversation_id),
    priceOrFinanceBlocked: priceBlocked.has(r.conversation_id),
    recommendationMade: (r.products_recommended_count ?? 0) > 0,
    frictionUnaddressed: r.objection_coverage !== null && Number(r.objection_coverage) < 1,
  }));

  // (1) What customers keep asking, grouped by the topic the model labelled.
  const questionMap = new Map<string, { count: number; example: string | null }>();
  for (const v of byField("customer_questions")) {
    const key = v.label ?? "other";
    const entry = questionMap.get(key) ?? { count: 0, example: null };
    entry.count += 1;
    entry.example ??= v.value_text;
    questionMap.set(key, entry);
  }
  const questionTopics = [...questionMap.entries()]
    .map(([key, { count, example }]) => ({ key: key.replaceAll("_", " "), count, example }))
    .sort((a, b) => b.count - a.count);

  // (2) The order decision filters surface, from the timestamps already carried
  // by each fact's evidence.
  const groupIds = fv.map((v) => v.evidence_group_id).filter((id): id is string => id !== null);
  const firstMsByGroup = new Map<string, number>();
  if (groupIds.length > 0) {
    const { data: refs } = await supabase
      .from("evidence_references")
      .select("evidence_group_id, start_milliseconds")
      .eq("organization_id", organizationId)
      .in("evidence_group_id", groupIds);
    for (const ref of refs ?? []) {
      // A citation without a timestamp cannot place the moment, so it is skipped
      // rather than treated as time zero and dragged to the front of the order.
      if (ref.start_milliseconds === null) continue;
      const seen = firstMsByGroup.get(ref.evidence_group_id);
      if (seen === undefined || ref.start_milliseconds < seen) {
        firstMsByGroup.set(ref.evidence_group_id, ref.start_milliseconds);
      }
    }
  }
  const appearances: DecisionAppearance[] = [];
  for (const v of fv) {
    const dimension = decisionDimensionFor(v.field_key);
    if (!dimension || !v.evidence_group_id) continue;
    const firstMilliseconds = firstMsByGroup.get(v.evidence_group_id);
    if (firstMilliseconds === undefined) continue;
    appearances.push({ conversationId: v.conversation_id, dimension, firstMilliseconds });
  }
  const decisionHierarchy = computeDecisionHierarchy(appearances);

  // (3) Observed buying behaviour per ANUMA category, against the stated role.
  //
  // Grouped by the confirmed meaning of what the customer said rather than by
  // the words themselves. "2 bhk flat", "2 bhk property", "property / 2 bhk
  // flat" and "residential property / apartment" are one category described four
  // ways; grouped as text they read as four categories of one interaction each,
  // and the pattern a category head is looking for disappears into the noise.
  //
  // A phrase nobody has confirmed yet is never guessed at — it is counted as
  // unresolved and named in the coverage note, so a thin category is visibly
  // thin rather than quietly missing.
  const phraseByConversation = new Map<string, string>();
  for (const v of byField("purchase_category")) {
    if (v.value_text && !phraseByConversation.has(v.conversation_id)) {
      phraseByConversation.set(v.conversation_id, normalizeCategoryPhrase(v.value_text));
    }
  }

  const [spokenResult, roleResult, ontologyResult] = await Promise.all([
    supabase
      .from("spoken_category_mappings")
      .select("phrase, anuma_category_key, status")
      .eq("organization_id", organizationId),
    supabase
      .from("category_roles")
      .select("category, intended_role")
      .eq("organization_id", organizationId),
    supabase.from("anuma_categories").select("key, label"),
  ]);

  // What this retailer's own catalogue calls each phrase, resolved by measuring
  // rather than by anyone confirming it.
  const { data: retailerResolutions } = await supabase
    .from("category_resolutions")
    .select("phrase, resolved_label")
    .eq("organization_id", organizationId);
  const retailerLabels = new Map(
    (retailerResolutions ?? []).map((row) => [row.phrase, row.resolved_label]),
  );

  const resolution = resolveSpokenCategories(
    phraseByConversation,
    (spokenResult.data ?? []).map((row) => ({
      phrase: row.phrase,
      anumaCategoryKey: row.anuma_category_key,
      status: row.status as SpokenMappingStatus,
    })),
    retailerLabels,
  );

  // A key with no label in the shared ontology is the retailer's own word for a
  // category, or the customer's, and both read better on a dashboard than a
  // blank.
  const labelByKey = new Map((ontologyResult.data ?? []).map((r) => [r.key, r.label]));
  // Roles are stated against an ANUMA category key, so a change in the
  // retailer's or the customer's wording never detaches a role from its category.
  const roleByKey = new Map(
    (roleResult.data ?? []).map((r) => [r.category, r.intended_role as CategoryRole]),
  );

  const behaviourByKey = new Map<string, ReturnType<typeof classifyBuyingBehaviour>[]>();
  for (const r of rows) {
    const key = resolution.keyByConversation.get(r.conversation_id);
    if (key === undefined) continue;
    const behaviour = classifyBuyingBehaviour({
      arrivalIntent: r.arrival_intent,
      clarityStart: r.clarity_start,
      productsConsidered: r.products_considered_count ?? 0,
      competitorsNamed: r.competitor_count ?? 0,
    });
    const list = behaviourByKey.get(key) ?? [];
    list.push(behaviour);
    behaviourByKey.set(key, list);
  }
  const behaviour = [...behaviourByKey.entries()]
    .map(([key, list]) =>
      summarizeBehaviour(labelByKey.get(key) ?? key, list, roleByKey.get(key) ?? null),
    )
    .sort((a, b) => b.observed - a.observed);

  const categoryCoverage: CategoryCoverage = {
    resolved: resolution.keyByConversation.size,
    outsideRange: resolution.outsideRange,
    unresolved: [...resolution.unresolved.values()].reduce((total, count) => total + count, 0),
    unresolvedPhrases: [...resolution.unresolved.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
  };

  return {
    questionTopics,
    decisionHierarchy,
    behaviour,
    categoryCoverage,
    leakage: computeDemandLeakage(leakageInputs),
    conversations: rows.length,
    windowDays,

    purchased: rows.filter((r) => r.decision_state === "purchased").length,
    followUp: rows.filter((r) => r.decision_state === "follow_up_scheduled").length,
    clarityImproved: { improved: clarityImproved, measured: clarityMeasured.length },

    themes,
    useCases: tally(byField("purchase_use_cases").map((v) => v.value_text)),
    brands: tally(byField("brand_preferences").map((v) => v.value_text)),
    requirementDimensions,
    budgetBands: budgetBands(budgets, budgetCurrency),
    budget: { median: median(budgets), currency: budgetCurrency, count: budgets.length },
    urgency: tally(byField("purchase_timing").map((v) => clusterTiming(v.value_text))),

    clarityStart: tally(clarityMeasured.map((r) => CLARITY_LABEL[r.clarity_start ?? 0] ?? null)),
    clarityEnd: tally(clarityMeasured.map((r) => CLARITY_LABEL[r.clarity_end ?? 0] ?? null)),

    competitors: tally(byField("competitor_named").map((v) => v.value_text)),
    competitorProducts: tally(byField("competitor_product").map((v) => v.value_text)),
    shadowPrices,
    priceGap: {
      median: median(priceGaps),
      basis: priceGaps.length > 0 ? "claimed" : null,
      count: priceGaps.length,
    },
    competitorMentionRate: rows.filter((r) => (r.competitor_count ?? 0) > 0).length / rows.length,

    objectionClusters: tally(byField("objections").map((v) => clusterObjection(v.value_text))),
    lostDemand: { count: lostConversationIds.size, topReason: lostReasonRanked[0]?.key ?? null },
    redFlagRate: rows.filter((r) => (r.red_flag_count ?? 0) > 0).length / rows.length,
    redFlagCategories: tally(
      byField("red_flags").map((v) => v.label?.replaceAll("_", " ") ?? null),
    ),

    objectionCoverage: mean(coverages),
    alternativeOfferRate:
      alternativeEligible.length > 0
        ? alternativeEligible.filter((r) => r.alternative_offered === "yes").length /
          alternativeEligible.length
        : null,
    demoRate:
      demoMeasured.length > 0
        ? demoMeasured.filter((r) => r.demo_performed === "yes").length / demoMeasured.length
        : null,
    crossSellRate: rows.filter((r) => (r.cross_sell_count ?? 0) > 0).length / rows.length,
    upsellRate: rows.filter((r) => (r.upsell_count ?? 0) > 0).length / rows.length,
    financeInterest: rows.filter((r) => r.finance_requested).length,
    productsConsidered: tally(byField("products_considered").map((v) => v.value_text)),
    productsRecommended: tally(byField("products_recommended").map((v) => v.value_text)),
    decisionStates: tally(rows.map((r) => r.decision_state)),
    arrivalIntents: tally(rows.map((r) => r.arrival_intent)),
  };
}

/**
 * The outcome of each conversation, for the list view.
 *
 * A conversation can have several records; the most recently computed metrics
 * row wins, so the list reflects the latest understanding. Returned as a map
 * keyed by conversation so the caller can annotate its own list without a
 * second pass.
 */
export async function getConversationOutcomes(
  organizationId: string,
  conversationIds: readonly string[],
): Promise<Map<string, string>> {
  if (conversationIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("interaction_metrics")
    .select("conversation_id, decision_state, computed_at")
    .eq("organization_id", organizationId)
    .in("conversation_id", [...conversationIds])
    .order("computed_at", { ascending: false });

  const outcomes = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.decision_state && !outcomes.has(row.conversation_id)) {
      outcomes.set(row.conversation_id, row.decision_state);
    }
  }
  return outcomes;
}

function emptyIntelligence(windowDays: number): DemandIntelligence {
  return {
    conversations: 0,
    windowDays,
    purchased: 0,
    followUp: 0,
    clarityImproved: { improved: 0, measured: 0 },
    themes: [],
    questionTopics: [],
    decisionHierarchy: [],
    behaviour: [],
    categoryCoverage: { resolved: 0, outsideRange: 0, unresolved: 0, unresolvedPhrases: [] },
    useCases: [],
    brands: [],
    requirementDimensions: [],
    budgetBands: [],
    budget: { median: null, currency: null, count: 0 },
    urgency: [],
    clarityStart: [],
    clarityEnd: [],
    competitors: [],
    competitorProducts: [],
    shadowPrices: [],
    priceGap: { median: null, basis: null, count: 0 },
    competitorMentionRate: 0,
    leakage: computeDemandLeakage([]),
    objectionClusters: [],
    lostDemand: { count: 0, topReason: null },
    redFlagRate: null,
    redFlagCategories: [],
    objectionCoverage: null,
    alternativeOfferRate: null,
    demoRate: null,
    crossSellRate: null,
    upsellRate: null,
    financeInterest: 0,
    productsConsidered: [],
    productsRecommended: [],
    decisionStates: [],
    arrivalIntents: [],
  };
}
