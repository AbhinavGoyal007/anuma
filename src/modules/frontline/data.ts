import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.generated";
import { getConversationOutcomes } from "@/modules/interaction-metrics/aggregate";
import type { MembershipRole } from "@/modules/identity/roles";

/**
 * Reads for the frontline (salesperson) views.
 *
 * The set of salespeople a viewer sees is derived from the conversations they
 * may see, so row level security does the scoping for free: an administrator
 * sees every rep, a manager sees the reps in their assigned scope, and a
 * representative sees only themselves. Names come from the member directory,
 * which is a lookup only — it never widens what interactions a viewer can read.
 *
 * Performance is aggregated per rep from the same deterministic metrics the
 * demand dashboard uses, joined to the rep through the conversation (the metrics
 * row denormalises store and category, but not the rep). The SOP score comes
 * from the review scorecard where one has been evaluated.
 */

export type FrontlineFilters = {
  /** A single store (location). Omitted means every store in the viewer's scope. */
  locationId?: string;
};

export type RepPerformance = {
  /** Conversations with a computed metrics row — the denominator for the rates. */
  measured: number;
  objectionCoverage: number | null;
  clarityLift: { improved: number; measured: number };
  alternativeOfferRate: number | null;
  demoRate: number | null;
  crossSellRate: number | null;
  redFlagRate: number | null;
  financeInterest: number;
  purchased: number;
  followUp: number;
  outcomes: { key: string; count: number }[];
  /** Mean review-scorecard percentage, or null where no scorecard was evaluated. */
  sopScore: number | null;
};

export type Salesperson = {
  membershipId: string;
  email: string | null;
  role: MembershipRole;
  interactions: number;
  lastActiveAt: string | null;
  performance: RepPerformance;
};

export type RepInteraction = {
  id: string;
  title: string | null;
  vertical: string;
  startedAt: string;
  lifecycleStatus: string;
  locationId: string | null;
  outcome: string | null;
};

export type RepProfile = {
  membershipId: string;
  email: string | null;
  role: MembershipRole;
  performance: RepPerformance;
  interactions: RepInteraction[];
};

type Supabase = SupabaseClient<Database>;
type MetricRow = {
  decision_state: string | null;
  objection_coverage: number | null;
  clarity_start: number | null;
  clarity_end: number | null;
  alternative_offered: string | null;
  demo_performed: string | null;
  finance_requested: boolean | null;
  cross_sell_count: number | null;
  red_flag_count: number | null;
};

function mean(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function tally(labels: readonly (string | null)[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/** The same metric definitions the demand dashboard uses, over one rep's rows. */
function computeRepPerformance(
  rows: readonly MetricRow[],
  sopScores: readonly number[],
): RepPerformance {
  const coverages = rows
    .map((r) => (r.objection_coverage === null ? null : Number(r.objection_coverage)))
    .filter((n): n is number => n !== null);
  const clarityMeasured = rows.filter((r) => r.clarity_start !== null && r.clarity_end !== null);
  const clarityImproved = clarityMeasured.filter(
    (r) => (r.clarity_end ?? 0) > (r.clarity_start ?? 0),
  ).length;
  const altEligible = rows.filter(
    (r) => r.alternative_offered === "yes" || r.alternative_offered === "no",
  );
  const demoMeasured = rows.filter((r) => r.demo_performed === "yes" || r.demo_performed === "no");

  return {
    measured: rows.length,
    objectionCoverage: mean(coverages),
    clarityLift: { improved: clarityImproved, measured: clarityMeasured.length },
    alternativeOfferRate:
      altEligible.length > 0
        ? altEligible.filter((r) => r.alternative_offered === "yes").length / altEligible.length
        : null,
    demoRate:
      demoMeasured.length > 0
        ? demoMeasured.filter((r) => r.demo_performed === "yes").length / demoMeasured.length
        : null,
    crossSellRate:
      rows.length > 0
        ? rows.filter((r) => (r.cross_sell_count ?? 0) > 0).length / rows.length
        : null,
    redFlagRate:
      rows.length > 0 ? rows.filter((r) => (r.red_flag_count ?? 0) > 0).length / rows.length : null,
    financeInterest: rows.filter((r) => r.finance_requested).length,
    purchased: rows.filter((r) => r.decision_state === "purchased").length,
    followUp: rows.filter((r) => r.decision_state === "follow_up_scheduled").length,
    outcomes: tally(rows.map((r) => r.decision_state)),
    sopScore: mean(sopScores),
  };
}

async function memberDirectory(supabase: Supabase, organizationId: string) {
  const { data } = await supabase.rpc("organization_member_directory", {
    p_organization_id: organizationId,
  });
  return new Map((data ?? []).map((row) => [row.membership_id, row]));
}

/**
 * The current metrics row and latest scorecard score per conversation.
 *
 * A conversation can be re-processed, leaving several metrics rows; the most
 * recently computed one is the current one, matching how the dashboard chooses.
 */
async function fetchPerformanceInputs(
  supabase: Supabase,
  organizationId: string,
  conversationIds: readonly string[],
): Promise<{
  metricByConversation: Map<string, MetricRow>;
  sopByConversation: Map<string, number>;
}> {
  if (conversationIds.length === 0) {
    return { metricByConversation: new Map(), sopByConversation: new Map() };
  }
  const ids = [...conversationIds];
  const [{ data: metrics }, { data: scores }] = await Promise.all([
    supabase
      .from("interaction_metrics")
      .select(
        "conversation_id, computed_at, decision_state, objection_coverage, clarity_start, clarity_end, alternative_offered, demo_performed, finance_requested, cross_sell_count, red_flag_count",
      )
      .eq("organization_id", organizationId)
      .in("conversation_id", ids)
      .order("computed_at", { ascending: false }),
    supabase
      .from("scorecard_evaluations")
      .select("conversation_id, score_percent, created_at")
      .eq("organization_id", organizationId)
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const metricByConversation = new Map<string, MetricRow>();
  for (const row of metrics ?? []) {
    if (!metricByConversation.has(row.conversation_id)) {
      metricByConversation.set(row.conversation_id, row);
    }
  }
  const sopByConversation = new Map<string, number>();
  for (const row of scores ?? []) {
    if (row.score_percent !== null && !sopByConversation.has(row.conversation_id)) {
      sopByConversation.set(row.conversation_id, Number(row.score_percent));
    }
  }
  return { metricByConversation, sopByConversation };
}

function performanceFor(
  conversationIds: readonly string[],
  metricByConversation: Map<string, MetricRow>,
  sopByConversation: Map<string, number>,
): RepPerformance {
  const rows = conversationIds
    .map((id) => metricByConversation.get(id))
    .filter((row): row is MetricRow => row !== undefined);
  const sopScores = conversationIds
    .map((id) => sopByConversation.get(id))
    .filter((score): score is number => score !== undefined);
  return computeRepPerformance(rows, sopScores);
}

export async function getSalespeople(
  organizationId: string,
  filters: FrontlineFilters = {},
): Promise<Salesperson[]> {
  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select("id, representative_membership_id, started_at")
    .eq("organization_id", organizationId);
  if (filters.locationId) query = query.eq("location_id", filters.locationId);
  const [{ data: conversations }, directory] = await Promise.all([
    query,
    memberDirectory(supabase, organizationId),
  ]);
  const rows = conversations ?? [];

  const byRep = new Map<string, { conversationIds: string[]; lastActiveAt: string | null }>();
  for (const conversation of rows) {
    const id = conversation.representative_membership_id;
    const entry = byRep.get(id) ?? { conversationIds: [], lastActiveAt: null };
    entry.conversationIds.push(conversation.id);
    if (!entry.lastActiveAt || conversation.started_at > entry.lastActiveAt) {
      entry.lastActiveAt = conversation.started_at;
    }
    byRep.set(id, entry);
  }

  const { metricByConversation, sopByConversation } = await fetchPerformanceInputs(
    supabase,
    organizationId,
    rows.map((row) => row.id),
  );

  return [...byRep.entries()]
    .map(([membershipId, agg]) => ({
      membershipId,
      email: directory.get(membershipId)?.email ?? null,
      role: (directory.get(membershipId)?.role ?? "representative") as MembershipRole,
      interactions: agg.conversationIds.length,
      lastActiveAt: agg.lastActiveAt,
      performance: performanceFor(agg.conversationIds, metricByConversation, sopByConversation),
    }))
    .sort((a, b) => b.interactions - a.interactions);
}

export async function getRepProfile(
  organizationId: string,
  membershipId: string,
  filters: FrontlineFilters = {},
): Promise<RepProfile | null> {
  const supabase = await createClient();
  let historyQuery = supabase
    .from("conversations")
    .select("id, title, vertical, started_at, lifecycle_status, location_id")
    .eq("organization_id", organizationId)
    .eq("representative_membership_id", membershipId)
    .order("started_at", { ascending: false });
  if (filters.locationId) historyQuery = historyQuery.eq("location_id", filters.locationId);
  const [{ data: conversations }, directory] = await Promise.all([
    historyQuery,
    memberDirectory(supabase, organizationId),
  ]);

  const member = directory.get(membershipId);
  const rows = conversations ?? [];
  // Neither known to the directory nor holder of any visible conversation: the
  // viewer has no business on this rep's page.
  if (!member && rows.length === 0) return null;

  const conversationIds = rows.map((row) => row.id);
  const [outcomes, { metricByConversation, sopByConversation }] = await Promise.all([
    getConversationOutcomes(organizationId, conversationIds),
    fetchPerformanceInputs(supabase, organizationId, conversationIds),
  ]);

  return {
    membershipId,
    email: member?.email ?? null,
    role: (member?.role ?? "representative") as MembershipRole,
    performance: performanceFor(conversationIds, metricByConversation, sopByConversation),
    interactions: rows.map((row) => ({
      id: row.id,
      title: row.title,
      vertical: row.vertical,
      startedAt: row.started_at,
      lifecycleStatus: row.lifecycle_status,
      locationId: row.location_id,
      outcome: outcomes.get(row.id) ?? null,
    })),
  };
}
