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
export function resolveCohort(
  rows: readonly PopulationRow[],
  key: string,
  journeyCohort: JourneyCohortKey = "all",
): ActionCohort | null {
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
