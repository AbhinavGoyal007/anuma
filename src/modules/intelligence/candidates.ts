import type { DemandMetrics } from "@/modules/intelligence/demand";
import type { ActionCohort } from "@/modules/intelligence/frontline";
import {
  change,
  DEFAULT_GUARDRAILS,
  type Guardrails,
  type Measure,
} from "@/modules/intelligence/guardrails";
import { metric } from "@/modules/intelligence/metric-registry";

/**
 * What a manager should look at first, decided in code.
 *
 * Nothing here asks a model anything. A candidate is a template filled from
 * numbers that already exist, promoted only when it clears a stated bar — so the
 * same data always produces the same shortlist, and the reason an item appeared
 * can be read off the rules rather than guessed at.
 *
 * Priority is explicit for the same reason. A weighted score would rank these
 * more smoothly and would be unarguable in the wrong way: nobody could say why
 * item three outranked item four, and nobody could tune it. These are three
 * plain rules a business can disagree with and change.
 */

export type CandidateKind = "change" | "gap";
export type Priority = "high" | "medium" | "low";

export type IntelligenceCandidate = {
  id: string;
  kind: CandidateKind;
  module: "customer_demand" | "frontline";
  /** The whole finding, in one sentence a manager could say out loud. */
  headline: string;
  /** Why it is worth their attention. One line, never a recommendation. */
  soWhat: string;
  metricKey?: string;
  currentValue?: number | null;
  previousValue?: number | null;
  deltaPoints?: number | null;
  affected: number;
  eligible: number;
  priority: Priority;
  /** Where the reader goes to see the interactions. */
  href: string | null;
};

export type CandidateThresholds = {
  /** Percentage points a rate must move before the change is worth a headline. */
  materialChangePoints: number;
  /** Interactions a gap must affect before it is promoted at all. */
  materialAffected: number;
  /** Affected interactions that make a gap high priority. */
  urgentAffected: number;
};

export const DEFAULT_THRESHOLDS: CandidateThresholds = {
  materialChangePoints: 5,
  materialAffected: 5,
  urgentAffected: 10,
};

/**
 * How a change is worded.
 *
 * Direction is described, never judged. "Finance demand rose" is a fact; "finance
 * demand worsened" is an opinion about a customer behaviour the store does not
 * control, and the page has no business holding it.
 */
const CHANGE_COPY: Readonly<Record<string, { rose: string; fell: string; soWhat: string }>> = {
  high_intent_arrival: {
    rose: "More customers are arriving already decided",
    fell: "Fewer customers are arriving already decided",
    soWhat: "Review how arrival intent is distributed across categories and stores.",
  },
  finance_demand: {
    rose: "More customers are asking about finance",
    fell: "Fewer customers are asking about finance",
    soWhat:
      "Finance is playing a larger role in these conversations. Review finance-response coverage in Frontline.",
  },
  competitor_pressure: {
    rose: "More customers are naming a competitor",
    fell: "Fewer customers are naming a competitor",
    soWhat: "Review which competitors and which prices customers cited.",
  },
  clarity_improved: {
    rose: "Conversations are leaving customers clearer about what they need",
    fell: "Conversations are leaving customers less clear about what they need",
    soWhat: "Review the clarity matrix and the interactions that stayed low-clarity before acting.",
  },
};

/**
 * Changes between the two periods that are large enough and solid enough to say.
 *
 * Both periods must independently clear the comparison bar. A confident current
 * month measured against six conversations is not a trend, and printing it as
 * one is how a dashboard teaches people to ignore it.
 */
export function changeCandidates(
  current: DemandMetrics,
  previous: DemandMetrics | null,
  /** Clarity is computed by the matrix, so it is passed in rather than redone. */
  clarity: { current: Measure; previous: Measure } | null = null,
  thresholds: CandidateThresholds = DEFAULT_THRESHOLDS,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): IntelligenceCandidate[] {
  if (!previous) return [];

  const pairs: [string, Measure, Measure][] = [
    ["high_intent_arrival", current.highIntent, previous.highIntent],
    ["finance_demand", current.financeDemand, previous.financeDemand],
    ["competitor_pressure", current.competitorPressure, previous.competitorPressure],
    ...(clarity
      ? ([["clarity_improved", clarity.current, clarity.previous]] as [string, Measure, Measure][])
      : []),
  ];

  const candidates: IntelligenceCandidate[] = [];
  for (const [key, now, before] of pairs) {
    const delta = change(now, before, guardrails);
    if (!delta.comparable || delta.deltaPoints === null) continue;
    if (Math.abs(delta.deltaPoints) < thresholds.materialChangePoints) continue;
    // A headline on the Overview carries more weight than the same comparison
    // sitting in a table on a detail page, so it answers to a higher bar. Ten
    // observations a side is enough to look at; it is not enough to lead with.
    if (
      now.observed < guardrails.minimumForConfidentDisplay ||
      before.observed < guardrails.minimumForConfidentDisplay
    ) {
      continue;
    }

    const copy = CHANGE_COPY[key]!;
    const rose = delta.deltaPoints > 0;
    candidates.push({
      id: `change:${key}`,
      kind: "change",
      module: "customer_demand",
      headline: `${rose ? copy.rose : copy.fell}: ${Math.round((now.value ?? 0) * 100)}% against ${Math.round((before.value ?? 0) * 100)}% (${rose ? "+" : ""}${Math.round(delta.deltaPoints)}pp).`,
      soWhat: copy.soWhat,
      metricKey: key,
      currentValue: now.value,
      previousValue: before.value,
      deltaPoints: delta.deltaPoints,
      affected: now.affected ?? 0,
      eligible: now.observed,
      // A movement is worth reading; it is not by itself something to do. Only
      // a gap with named interactions behind it earns high priority.
      priority:
        Math.abs(delta.deltaPoints) >= thresholds.materialChangePoints * 2 ? "medium" : "low",
      href: "/intelligence/demand",
    });
  }

  return candidates;
}

/**
 * Execution gaps, ranked by how many interactions they cost.
 *
 * The count is the priority. A gap affecting thirty conversations matters more
 * than one affecting three regardless of which is a larger share, because the
 * work of reviewing them is per conversation.
 */
export function gapCandidates(
  cohorts: readonly ActionCohort[],
  query: string,
  thresholds: CandidateThresholds = DEFAULT_THRESHOLDS,
): IntelligenceCandidate[] {
  return cohorts
    .filter((cohort) => cohort.conversationIds.length >= thresholds.materialAffected)
    .map((cohort) => {
      const affected = cohort.conversationIds.length;
      // The denominator travels with the count. Ten of twelve and ten of five
      // hundred are the same headline and completely different situations, and
      // a manager deciding what to do this morning needs to know which one they
      // are looking at before they open anything.
      const measurable = cohort.measurable ?? null;
      const rate = measurable && measurable > 0 ? affected / measurable : null;
      return {
        id: `gap:${cohort.key}`,
        kind: "gap" as const,
        module: "frontline" as const,
        headline:
          measurable && measurable > 0
            ? `${affected} of ${measurable} ${cohort.headline}.`
            : `${affected} ${cohort.headline}.`,
        soWhat: cohort.reason,
        affected,
        eligible: measurable ?? affected,
        currentValue: rate,
        priority: (affected >= thresholds.urgentAffected ? "high" : "medium") as Priority,
        href: `/intelligence/cohort/${cohort.key}${query}`,
      };
    });
}

const PRIORITY_ORDER: Readonly<Record<Priority, number>> = { high: 0, medium: 1, low: 2 };

/** Highest priority first, then by how many interactions are involved. */
export function rankCandidates(
  candidates: readonly IntelligenceCandidate[],
): IntelligenceCandidate[] {
  return [...candidates].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.affected - a.affected,
  );
}

/**
 * Why the shortlist is empty, when it is.
 *
 * An overview with nothing on it should say which bar was not cleared. "No
 * insights" reads as a broken page; "the previous period holds two interactions,
 * which is below the ten needed to compare" reads as an answer.
 */
export function suppressionReason(
  analysed: number,
  previousAnalysed: number | null,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): string | null {
  if (analysed === 0) return null;
  if (previousAnalysed === null) {
    return "Comparison is switched off, so nothing here is measured against a previous period.";
  }
  if (previousAnalysed < guardrails.minimumForComparison) {
    return `The previous period holds ${previousAnalysed} interaction${previousAnalysed === 1 ? "" : "s"}, below the ${guardrails.minimumForComparison} needed before a change is worth reporting. Widen the period to compare.`;
  }
  if (analysed < guardrails.minimumForComparison) {
    return `This period holds ${analysed} interaction${analysed === 1 ? "" : "s"}, below the ${guardrails.minimumForComparison} needed before a change is worth reporting.`;
  }
  return null;
}

/** The metric label, for a candidate that names one. */
export function candidateMetricLabel(candidate: IntelligenceCandidate): string | null {
  return candidate.metricKey ? metric(candidate.metricKey).label : null;
}
