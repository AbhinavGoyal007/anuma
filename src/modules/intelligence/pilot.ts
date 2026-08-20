/**
 * The pilot value loop: what managers do with Intelligence, and what they say
 * it was worth.
 *
 * Two deliberately narrow records. A usage event says which management object
 * was opened and under what filters — never what was in it. No transcript text,
 * no customer words, no extracted values: a pilot needs to know whether a
 * manager reached the evidence, not what the evidence said, and putting a copy
 * of a real customer's words in an analytics table is how a recording ends up
 * somewhere nobody is watching.
 *
 * A finding review is the manager's own judgement, stored against a hash of the
 * scope it was answered under, so "was this useful" stays attached to the
 * finding as it stood at the time rather than to whatever the same query
 * returns next week.
 */

export const USAGE_EVENTS = [
  "intelligence_page_viewed",
  "filter_changed",
  "core_signal_opened",
  "priority_action_opened",
  "trend_metric_selected",
  "breakdown_dimension_selected",
  "demand_value_reviewed",
  "journey_cohort_selected",
  "journey_diagnosis_opened",
  "frontline_stage_selected",
  "evidence_drawer_opened",
  "conversation_opened",
  "finding_reviewed",
  "finding_usefulness_saved",
  "management_action_saved",
] as const;

export type UsageEventName = (typeof USAGE_EVENTS)[number];

export const USEFULNESS = ["yes", "no", "unclear"] as const;
export type Usefulness = (typeof USEFULNESS)[number];

export const ACTION_TYPES = [
  "no_action_yet",
  "store_follow_up",
  "frontline_coaching",
  "commercial_follow_up",
  "data_correction",
  "share_escalate",
  "other",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABELS: Readonly<Record<ActionType, string>> = {
  no_action_yet: "No action yet",
  store_follow_up: "Store follow-up",
  frontline_coaching: "Frontline coaching",
  commercial_follow_up: "Commercial follow-up",
  data_correction: "Data correction",
  share_escalate: "Share or escalate",
  other: "Other",
};

export const PRIOR_KNOWLEDGE = ["yes", "no", "unsure"] as const;
export type PriorKnowledge = (typeof PRIOR_KNOWLEDGE)[number];

/** Only the population filters. Page-local state is not part of a finding's scope. */
export const SCOPE_KEYS = [
  "days",
  "compare",
  "store",
  "category",
  "rep",
  "intent",
  "outcome",
  "decision",
  "language",
] as const;

export type FindingReview = {
  findingKey: string;
  cohortKey: string;
  scopeFingerprint: string;
  reviewedAt: string | null;
  usefulness: Usefulness | null;
  actionType: ActionType | null;
  wouldHaveKnownWithoutAnuma: PriorKnowledge | null;
  note: string | null;
};

/** Free-text notes are a manager's own words, and long ones are a different feature. */
export const NOTE_LIMIT = 500;

export type PilotEventRow = {
  membership_id: string;
  session_id: string;
  occurred_at: string;
  event_name: UsageEventName;
  cohort_key: string | null;
};

export type PilotReviewRow = {
  membership_id: string;
  usefulness: string | null;
  action_type: string | null;
  reviewed_at: string | null;
};

export type PilotMetrics = {
  weeklyActiveManagers: number;
  managersReturningWeekOverWeek: number;
  priorityActionsOpened: number;
  /** Of priority actions opened, how many led to the evidence drawer. */
  evidenceDrawerRateFromPriorityActions: number | null;
  findingsReviewed: number;
  usefulFindingRate: number | null;
  managementActionRate: number | null;
  sessionsReachingConversationEvidence: number;
  dataCorrectionActionRate: number | null;
  /** Median seconds from opening a priority action to opening its evidence. */
  medianSecondsPriorityActionToEvidence: number | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

const rate = (affected: number, of: number): number | null => (of > 0 ? affected / of : null);

/** Pure, so the arithmetic can be tested without a database. */
export function computePilotMetrics(
  events: readonly PilotEventRow[],
  reviews: readonly PilotReviewRow[],
  now: Date,
): PilotMetrics {
  const weekAgo = now.getTime() - WEEK_MS;
  const twoWeeksAgo = now.getTime() - 2 * WEEK_MS;
  const at = (event: PilotEventRow) => new Date(event.occurred_at).getTime();

  const thisWeek = events.filter((event) => at(event) >= weekAgo);
  const lastWeek = events.filter((event) => at(event) >= twoWeeksAgo && at(event) < weekAgo);
  const active = new Set(thisWeek.map((event) => event.membership_id));
  const previouslyActive = new Set(lastWeek.map((event) => event.membership_id));

  const opened = events.filter((event) => event.event_name === "priority_action_opened");
  const drawers = events.filter((event) => event.event_name === "evidence_drawer_opened");

  // Time to evidence, per session and cohort: the first drawer opened after the
  // action was opened. Pairing across sessions would measure a coincidence.
  const latencies: number[] = [];
  for (const action of opened) {
    const follow = drawers
      .filter(
        (event) =>
          event.session_id === action.session_id &&
          event.cohort_key === action.cohort_key &&
          at(event) >= at(action),
      )
      .sort((a, b) => at(a) - at(b))[0];
    if (follow) latencies.push((at(follow) - at(action)) / 1000);
  }

  const reviewed = reviews.filter((review) => review.reviewed_at !== null);
  const answered = reviews.filter((review) => review.usefulness !== null);
  const acted = reviews.filter(
    (review) => review.action_type !== null && review.action_type !== "no_action_yet",
  );

  return {
    weeklyActiveManagers: active.size,
    managersReturningWeekOverWeek: [...active].filter((id) => previouslyActive.has(id)).length,
    priorityActionsOpened: opened.length,
    evidenceDrawerRateFromPriorityActions: rate(latencies.length, opened.length),
    findingsReviewed: reviewed.length,
    usefulFindingRate: rate(
      answered.filter((review) => review.usefulness === "yes").length,
      answered.length,
    ),
    managementActionRate: rate(acted.length, reviewed.length),
    sessionsReachingConversationEvidence: new Set(
      events
        .filter((event) => event.event_name === "conversation_opened")
        .map((event) => event.session_id),
    ).size,
    dataCorrectionActionRate: rate(
      reviews.filter((review) => review.action_type === "data_correction").length,
      reviewed.length,
    ),
    medianSecondsPriorityActionToEvidence: median(latencies),
  };
}
