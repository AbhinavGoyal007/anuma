import { frontlineActionCohorts, type ActionCohort } from "@/modules/intelligence/frontline";
import { journeyLeakageCohorts, selectCohort } from "@/modules/intelligence/journey";
import type { JourneyCohortKey } from "@/modules/intelligence/journey";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * Every named group of interactions a page can point at, in one place.
 *
 * The drill-down recomputes the group from the population rather than being
 * handed a list of ids, which is what makes the list provably the set the number
 * came from. Resolving both pages' groups through one function is the same
 * argument one level up: two routes each rebuilding "the interactions where a
 * commitment went unanswered" will agree until one of them is edited.
 */

/** How a value-level group is addressed in a URL. */
export const VALUE_COHORT_PREFIX = "value:";

export function valueCohortKey(fieldKey: string, value: string): string {
  return `${VALUE_COHORT_PREFIX}${fieldKey}:${value}`;
}

/**
 * The interactions carrying one observed value of one field.
 *
 * Not a failure cohort — it is the set behind a bar. Its evidence is the field
 * itself, so a reader clicking "Samsung" sees the sentence where Samsung was
 * actually said rather than a summary of why we counted it.
 */
export function valueCohort(
  rows: readonly PopulationRow[],
  fieldKey: string,
  value: string,
): ActionCohort {
  const matched = rows.filter((row) =>
    row.values.some(
      (item) =>
        item.fieldKey === fieldKey && !item.abstention && (item.valueText ?? "").trim() === value,
    ),
  );
  const measurable = rows.filter((row) =>
    row.values.some((item) => item.fieldKey === fieldKey),
  ).length;
  return {
    key: valueCohortKey(fieldKey, value),
    headline: `recorded “${value}”`,
    reason: `The field ${fieldKey} carried this exact value`,
    evidenceFieldKeys: [fieldKey],
    measurable,
    conversationIds: matched.map((row) => row.conversationId),
  };
}

export function resolveCohort(
  rows: readonly PopulationRow[],
  key: string,
  journeyCohort: JourneyCohortKey = "all",
): ActionCohort | null {
  if (key.startsWith(VALUE_COHORT_PREFIX)) {
    const rest = key.slice(VALUE_COHORT_PREFIX.length);
    const separator = rest.indexOf(":");
    if (separator <= 0) return null;
    return valueCohort(rows, rest.slice(0, separator), rest.slice(separator + 1));
  }

  const frontline = frontlineActionCohorts(rows).find((cohort) => cohort.key === key);
  if (frontline) return frontline;

  // Journey groups are defined within a selected cohort, so the same key means
  // a different set depending on which one is chosen. The caller passes it
  // through from the URL so a shared link opens the group that was clicked.
  const journey = journeyLeakageCohorts(selectCohort(rows, journeyCohort)).find(
    (cohort) => cohort.key === key,
  );
  return journey ?? null;
}
