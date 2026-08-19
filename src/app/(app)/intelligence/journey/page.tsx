import { redirect } from "next/navigation";

import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import { JourneyView } from "@/components/intelligence/journey-view";
import { PageHeader } from "@/components/ui/page-header";
import { filtersToQuery, windowLabel } from "@/modules/intelligence/filters";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import {
  interventions,
  journeyBreakdown,
  journeyLeakageCohorts,
  journeyStages,
  outcomeDistributions,
  JOURNEY_COHORTS,
  selectCohort,
  type JourneyCohortKey,
} from "@/modules/intelligence/journey";
import { loadPopulation } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomerJourneyPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const page = await resolveIntelligencePage(raw);
  if ("redirect" in page) redirect(page.redirect);

  const { filters, current: population, stores, representatives, categories } = page;

  const requested = Array.isArray(raw.cohort) ? raw.cohort[0] : raw.cohort;
  const cohortKey: JourneyCohortKey =
    JOURNEY_COHORTS.find((key) => key === requested) ?? "high_intent";

  const cohort = selectCohort(population.rows, cohortKey);
  // Computed once and shared, so the count on a gap in the rail is the count of
  // interactions its link opens.
  const leakage = journeyLeakageCohorts(cohort);
  const storeName = new Map(stores.map((item) => [item.id, item.name]));

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
        stores={stores}
        categories={categories}
        representatives={representatives}
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
        outcomes={outcomeDistributions(cohort)}
        cohortQuery={cohortQuery}
        periodLabel={windowLabel(filters.days)}
      />
    </>
  );
}
