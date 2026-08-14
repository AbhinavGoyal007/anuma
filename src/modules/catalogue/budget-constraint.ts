/**
 * The ceiling a customer put on what they would spend.
 *
 * Extraction already reads both figures a shopper gives — the number they open
 * with and the number they will stretch to — and stores them as integers in
 * minor units. Turning that into something the catalogue can be asked is
 * arithmetic, not language, so it belongs here rather than in a model.
 *
 * The stretch figure is the ceiling when one was stated. A customer who says
 * thirty-five and then forty has told you forty is the limit, and searching at
 * thirty-five would hide the car at thirty-eight they would have bought.
 *
 * Pure, because it decides which half of a retailer's range a customer is shown.
 */

import type { Requirement } from "@/modules/catalogue/missed-opportunity";

export type StatedBudget = {
  /** The figure the customer opened with, in minor units. */
  targetMinor: number | null;
  /** The most they said they could stretch to, in minor units. */
  maximumMinor: number | null;
};

/**
 * How far above a stated target to look when no ceiling was given.
 *
 * A shopper naming one figure is describing where they want to land, not a wall.
 * Every retailer knows this and every salesperson shows something slightly
 * above. Ten per cent is deliberately modest: the point is to avoid hiding a
 * near miss, not to justify showing them something at twice the price.
 */
export const STRETCH_ABOVE_TARGET = 1.1;

export function budgetConstraint(budget: StatedBudget): Requirement | null {
  const ceiling =
    budget.maximumMinor ??
    (budget.targetMinor === null ? null : Math.round(budget.targetMinor * STRETCH_ABOVE_TARGET));
  if (ceiling === null || ceiling <= 0) return null;

  return {
    key: "price_minor",
    comparison: "at_most",
    valueText: null,
    valueNumeric: ceiling,
  };
}
