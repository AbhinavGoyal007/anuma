import { redirect } from "next/navigation";

import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import { JourneyView } from "@/components/intelligence/journey-view";
import { PageHeader } from "@/components/ui/page-header";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  filtersToQuery,
  parseFilters,
  resolvePeriods,
  windowLabel,
} from "@/modules/intelligence/filters";
import {
  interventions,
  journeyBreakdown,
  journeyLeakageCohorts,
  journeyStages,
  JOURNEY_COHORTS,
  selectCohort,
  type JourneyCohortKey,
} from "@/modules/intelligence/journey";
import { loadPopulation } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomerJourneyPage({ searchParams }: PageProps) {
  const [context, raw] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, assignments, locations } = context.current;
  const filters = parseFilters(raw);
  const periods = resolvePeriods(filters);

  const requested = Array.isArray(raw.cohort) ? raw.cohort[0] : raw.cohort;
  const cohortKey: JourneyCohortKey =
    JOURNEY_COHORTS.find((key) => key === requested) ?? "high_intent";

  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores =
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id));
  const selectedStore = stores.find((item) => item.id === filters.storeId) ?? null;

  const population = await loadPopulation({
    organizationId: organization.id,
    from: periods.current.from,
    to: periods.current.to,
    locationId: selectedStore?.id ?? null,
    purchaseCategory: filters.category,
  });

  const cohort = selectCohort(population.rows, cohortKey);
  // Computed once and shared, so the count on a gap in the rail is the count of
  // interactions its link opens.
  const leakage = journeyLeakageCohorts(cohort);
  const storeName = new Map(locations.map((item) => [item.id, item.name]));

  // Compared by store where several are in scope, otherwise by category — a
  // single-store operator gets the comparison that is actually available to them
  // rather than a table with one row.
  const distinctStores = new Set(cohort.flatMap((row) => (row.locationId ? [row.locationId] : [])));
  const byStore = distinctStores.size > 1;

  const cohortQuery = (key: JourneyCohortKey) => {
    const base = filtersToQuery(filters);
    const separator = base ? "&" : "?";
    return `/intelligence/journey${base}${separator}cohort=${key}`;
  };

  const sizes = Object.fromEntries(
    JOURNEY_COHORTS.map((key) => [key, selectCohort(population.rows, key).length]),
  ) as Record<JourneyCohortKey, number>;

  return (
    <>
      <PageHeader eyebrow="Customer decision journey" title="How far customers got" />
      <IntelligenceFilterBar
        basePath="/intelligence/journey"
        filters={filters}
        stores={stores.map((store) => ({ id: store.id, name: store.name }))}
        categories={[
          ...new Set(
            population.rows.flatMap((row) => (row.purchaseCategory ? [row.purchaseCategory] : [])),
          ),
        ].sort()}
      />
      <JourneyView
        cohortKey={cohortKey}
        cohortSizes={sizes}
        stages={journeyStages(cohort, leakage)}
        lanes={interventions(cohort)}
        leakage={leakage}
        breakdown={journeyBreakdown(
          cohort,
          (row) => (byStore ? row.locationId : row.purchaseCategory),
          (key) => (byStore ? (storeName.get(key) ?? key) : key),
        )}
        breakdownLabel={byStore ? "Store" : "Category"}
        cohortQuery={cohortQuery}
        periodLabel={windowLabel(filters.days)}
      />
    </>
  );
}
