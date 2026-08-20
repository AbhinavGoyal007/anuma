import "server-only";

import { resolveCohort } from "@/modules/intelligence/cohorts";
import { DIAGNOSIS_ROWS } from "@/modules/intelligence/journey";
import { frontlinePriorityReviews, overviewPriorityActions } from "@/modules/intelligence/overview";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * Which findings a page is actually asking somebody to act on.
 *
 * One implementation, used by the page that renders the Review Outcome panel
 * and by the server action that saves the answer. A second definition on the
 * write path would eventually disagree with the first, and a manager's
 * judgement would attach to a set of interactions the page never showed them.
 *
 * This is also the reason a browser-supplied finding key is not authority: the
 * server re-derives what was reviewable from the current population and refuses
 * anything that is not on the list.
 */

export type ReviewablePage = "overview" | "demand" | "journey" | "frontline";

export const REVIEWABLE_PAGES: readonly ReviewablePage[] = [
  "overview",
  "demand",
  "journey",
  "frontline",
];

export type ReviewableFinding = {
  page: ReviewablePage;
  findingKey: string;
  cohortKey: string;
  /** The current records in the cohort, which are part of the finding's identity. */
  recordIds: string[];
};

function findingKeyFor(page: ReviewablePage, cohortKey: string): string {
  return `${page}_finding:${cohortKey}`;
}

/** Every cohort a page offers a Review Outcome for, in that page's own terms. */
export function reviewableCohortKeys(
  page: ReviewablePage,
  rows: readonly PopulationRow[],
): string[] {
  if (page === "overview") {
    return overviewPriorityActions(rows).flatMap((cohort) => (cohort ? [cohort.key] : []));
  }
  if (page === "frontline") {
    return frontlinePriorityReviews(rows).flatMap((cohort) => (cohort ? [cohort.key] : []));
  }
  if (page === "journey") {
    return DIAGNOSIS_ROWS.map((row) => row.cohortKey);
  }
  // Demand offers evidence, not findings to act on.
  return [];
}

export function reviewFindingKey(page: ReviewablePage, cohortKey: string): string {
  return findingKeyFor(page, cohortKey);
}

/**
 * Resolves a requested finding against what the page currently offers.
 *
 * Returns null for anything the product is not asking somebody to act on, so a
 * tampered or stale form submission is rejected rather than stored against a
 * finding that does not exist.
 */
export function resolveReviewableFinding(
  page: ReviewablePage,
  cohortKey: string,
  rows: readonly PopulationRow[],
  journeyCohort: Parameters<typeof resolveCohort>[2] = "all",
): ReviewableFinding | null {
  if (!reviewableCohortKeys(page, rows).includes(cohortKey)) return null;
  const cohort = resolveCohort(rows, cohortKey, journeyCohort);
  if (!cohort) return null;

  const matched = new Set(cohort.conversationIds);
  return {
    page,
    findingKey: findingKeyFor(page, cohortKey),
    cohortKey,
    recordIds: rows
      .filter((row) => matched.has(row.conversationId))
      .map((row) => row.recordId)
      .sort(),
  };
}
