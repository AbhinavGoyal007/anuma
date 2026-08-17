import { measure, type Measure } from "@/modules/intelligence/guardrails";
import { isUnresolved } from "@/modules/intelligence/outcome";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";

/**
 * What the frontline did, and what it left on the counter.
 *
 * Pure: takes the population, returns numbers. Nothing here reads the database,
 * so every denominator decision in this file is testable against a handful of
 * fabricated rows rather than only observable once a page renders.
 *
 * The recurring judgement is which interactions belong in a denominator. A demo
 * that made no sense for the product is not a demo the rep failed to give, and
 * counting it as one turns a metric a manager would act on into a number they
 * learn to ignore.
 */

const present = (row: PopulationRow, fieldKey: string): PopulationValue[] =>
  row.values.filter((value) => value.fieldKey === fieldKey && !value.abstention);

const has = (row: PopulationRow, fieldKey: string): boolean => present(row, fieldKey).length > 0;

/**
 * Whether the record was even asked this field.
 *
 * A record produced before a field existed carries no row for it — not an
 * abstention, nothing. Treating that absence as "no" would make every rate look
 * worse the further back you scroll, purely because the product improved.
 */
const supported = (row: PopulationRow, fieldKey: string): boolean =>
  row.values.some((value) => value.fieldKey === fieldKey);

/** A yes/no field where "not applicable" is excluded rather than counted as no. */
function applicableRate(
  rows: readonly PopulationRow[],
  read: (row: PopulationRow) => string | null,
) {
  let eligible = 0;
  let yes = 0;
  for (const row of rows) {
    const value = read(row);
    if (value !== "yes" && value !== "no") continue;
    eligible += 1;
    if (value === "yes") yes += 1;
  }
  return measure(yes, rows.length, eligible);
}

export type FrontlineMetrics = {
  recommendationRate: Measure;
  recommendationRationale: Measure;
  fullObjectionHandling: Measure;
  demoRate: Measure;
  alternativeRate: Measure;
  financeOfferGap: Measure;
  crossSellRate: Measure;
  upsellRate: Measure;
  closeAfterCommitment: Measure;
  nextActionCapture: Measure;
};

export function computeFrontline(rows: readonly PopulationRow[]): FrontlineMetrics {
  const base = rows.length;

  const recommending = rows.filter((row) => row.productsRecommendedCount > 0);
  const withRationale = recommending.filter((row) => has(row, "recommendation_reasons"));

  // Objection handling is judged per response, not per interaction: a rep who
  // fully answered two of five objections should not read the same as one who
  // answered their only objection.
  let objectionResponses = 0;
  let fullResponses = 0;
  for (const row of rows) {
    for (const value of present(row, "objection_response")) {
      if (value.valueText !== "full" && value.valueText !== "partial" && value.valueText !== "none")
        continue;
      objectionResponses += 1;
      if (value.valueText === "full") fullResponses += 1;
    }
  }

  const financeRequested = rows.filter((row) => row.financeRequested);
  const financeAnswered = financeRequested.filter((row) =>
    present(row, "commercial_offer_made").some((value) =>
      (value.label ?? value.valueText ?? "").toLowerCase().includes("finance"),
    ),
  );

  const commitment = rows.filter((row) => has(row, "customer_commitment_signals"));
  const closedAfter = commitment.filter((row) => has(row, "close_attempts"));

  const nextActionSupported = rows.filter((row) => supported(row, "next_action"));

  return {
    recommendationRate: measure(recommending.length, base, base),
    // Provisional: matched at interaction level because the record does not link
    // a reason to the recommendation it belongs to. Flagged in the registry and
    // surfaced on the page rather than presented as exact.
    recommendationRationale: measure(withRationale.length, base, recommending.length),
    fullObjectionHandling: measure(fullResponses, objectionResponses, objectionResponses),
    demoRate: applicableRate(rows, (row) => row.demoPerformed),
    alternativeRate: applicableRate(rows, (row) => row.alternativeOffered),
    // The gap, not the coverage: this metric exists to be driven to zero, and
    // stating it as "how often we answered" buries the interactions that matter.
    financeOfferGap: measure(
      financeRequested.length - financeAnswered.length,
      base,
      financeRequested.length,
    ),
    // Read from the pitch fields rather than from interaction_metrics. The
    // stored counts were computed by whichever version of the pipeline last
    // touched the record, and after the v1.3 change they mean something
    // different on old rows than on new ones. Taking the numerator from a stale
    // projection while taking the denominator from the current fields produced a
    // confident 100% on records that contain no pitch at all.
    crossSellRate: measure(
      rows.filter((row) => has(row, "cross_sell_pitch")).length,
      base,
      rows.filter((row) => supported(row, "cross_sell_pitch")).length,
    ),
    upsellRate: measure(
      rows.filter((row) => has(row, "upsell_pitch")).length,
      base,
      rows.filter((row) => supported(row, "upsell_pitch")).length,
    ),
    closeAfterCommitment: measure(closedAfter.length, base, commitment.length),
    nextActionCapture: measure(
      nextActionSupported.filter((row) => has(row, "next_action")).length,
      base,
      nextActionSupported.length,
    ),
  };
}

/**
 * The interactions behind a specific failure, so the page can offer them.
 *
 * An action a manager cannot open is a statistic. Each cohort keeps the
 * conversation ids rather than only a count, which is what makes the drill-down
 * exact instead of a re-derived approximation of the same idea.
 */
export type ActionCohort = {
  key: string;
  /** Manager-facing sentence, completed with the count by the page. */
  headline: string;
  /** Why these interactions matched, shown on each row of the drill-down. */
  reason: string;
  conversationIds: string[];
};

export function frontlineActionCohorts(rows: readonly PopulationRow[]): ActionCohort[] {
  const cohorts: ActionCohort[] = [];

  const withoutRationale = rows.filter(
    (row) => row.productsRecommendedCount > 0 && !has(row, "recommendation_reasons"),
  );
  if (withoutRationale.length) {
    cohorts.push({
      key: "recommendation_without_rationale",
      headline: "recommended a product without saying why",
      reason: "A recommendation was made and no reason was recorded",
      conversationIds: withoutRationale.map((row) => row.conversationId),
    });
  }

  const financeUnanswered = rows.filter(
    (row) =>
      row.financeRequested &&
      !present(row, "commercial_offer_made").some((value) =>
        (value.label ?? value.valueText ?? "").toLowerCase().includes("finance"),
      ),
  );
  if (financeUnanswered.length) {
    cohorts.push({
      key: "finance_request_without_finance_offer",
      headline: "asked about finance and got no finance offer",
      reason: "The customer requested finance and no finance offer was recorded",
      conversationIds: financeUnanswered.map((row) => row.conversationId),
    });
  }

  const objectionGap = rows.filter((row) =>
    present(row, "objection_response").some(
      (value) => value.valueText === "partial" || value.valueText === "none",
    ),
  );
  if (objectionGap.length) {
    cohorts.push({
      key: "objection_handling_gap",
      headline: "left an objection partly answered or unanswered",
      reason: "At least one objection response was judged partial or none",
      conversationIds: objectionGap.map((row) => row.conversationId),
    });
  }

  const commitmentNoClose = rows.filter(
    (row) => has(row, "customer_commitment_signals") && !has(row, "close_attempts"),
  );
  if (commitmentNoClose.length) {
    cohorts.push({
      key: "commitment_without_close_attempt",
      headline: "showed a buying signal that was never followed by a close",
      reason: "A commitment signal was recorded and no close attempt followed",
      conversationIds: commitmentNoClose.map((row) => row.conversationId),
    });
  }

  const readyUnresolved = rows.filter(
    (row) =>
      row.arrivalIntent === "ready_to_buy" &&
      isUnresolved(row.outcome) &&
      !has(row, "close_attempts"),
  );
  if (readyUnresolved.length) {
    cohorts.push({
      key: "ready_to_buy_without_close_attempt",
      headline: "arrived ready to buy, left unresolved, and were never asked for the sale",
      reason: "Arrival intent was ready to buy, no close attempt, outcome unresolved",
      conversationIds: readyUnresolved.map((row) => row.conversationId),
    });
  }

  const followUpNoAction = rows.filter(
    (row) => row.outcome.decision === "follow_up_scheduled" && !has(row, "next_action"),
  );
  if (followUpNoAction.length) {
    cohorts.push({
      key: "follow_up_without_next_action",
      headline: "agreed a follow-up with nothing concrete recorded to do",
      reason: "The customer left on a follow-up and no next action was captured",
      conversationIds: followUpNoAction.map((row) => row.conversationId),
    });
  }

  // Largest first: the page shows a handful, and the handful should be the ones
  // worth a manager's morning.
  return cohorts.sort((a, b) => b.conversationIds.length - a.conversationIds.length);
}

/**
 * How often a behaviour appears in sales versus non-sales.
 *
 * Association only. Interactions whose outcome was never established belong to
 * neither group and are dropped, because filing them under no-sale would
 * manufacture the very comparison this is meant to report.
 */
export type OutcomeAssociation = {
  behaviourKey: string;
  label: string;
  saleRate: number | null;
  noSaleRate: number | null;
  saleN: number;
  noSaleN: number;
  differencePoints: number | null;
};

const BEHAVIOURS: readonly { key: string; label: string; test: (row: PopulationRow) => boolean }[] =
  [
    {
      key: "recommendation",
      label: "Recommended a product",
      test: (row) => row.productsRecommendedCount > 0,
    },
    {
      key: "rationale",
      label: "Gave a reason for the recommendation",
      test: (row) => has(row, "recommendation_reasons"),
    },
    { key: "demo", label: "Demonstrated the product", test: (row) => row.demoPerformed === "yes" },
    {
      key: "cross_sell",
      label: "Pitched something alongside",
      test: (row) => row.crossSellCount > 0,
    },
    { key: "upsell", label: "Moved the customer up a tier", test: (row) => row.upsellCount > 0 },
    { key: "close", label: "Asked for the sale", test: (row) => has(row, "close_attempts") },
  ];

export function outcomeAssociations(rows: readonly PopulationRow[]): OutcomeAssociation[] {
  const sales = rows.filter((row) => row.outcome.business === "sale");
  const noSales = rows.filter((row) => row.outcome.business === "no_sale");

  return BEHAVIOURS.map(({ key, label, test }) => {
    const saleRate = sales.length ? sales.filter(test).length / sales.length : null;
    const noSaleRate = noSales.length ? noSales.filter(test).length / noSales.length : null;
    return {
      behaviourKey: key,
      label,
      saleRate,
      noSaleRate,
      saleN: sales.length,
      noSaleN: noSales.length,
      differencePoints:
        saleRate !== null && noSaleRate !== null ? (saleRate - noSaleRate) * 100 : null,
    };
  }).sort((a, b) => Math.abs(b.differencePoints ?? 0) - Math.abs(a.differencePoints ?? 0));
}
