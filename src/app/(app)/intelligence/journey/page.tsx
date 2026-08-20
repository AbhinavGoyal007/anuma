import { redirect } from "next/navigation";

import { IntelligenceDrawer } from "@/components/intelligence/intelligence-drawer";
import { IntelligenceFilterBar, IntelligenceHead } from "@/components/intelligence/filter-bar";
import { JourneyView } from "@/components/intelligence/journey-view";
import { cohortPath, valueCohortKey } from "@/modules/intelligence/cohorts";
import { intelligenceHref, single, windowLabel } from "@/modules/intelligence/filters";
import {
  interventions,
  journeyBreakdown,
  journeyDiagnosis,
  journeyLeakageCohorts,
  journeyStages,
  outcomeDistributions,
  productPath,
  JOURNEY_COHORTS,
  selectCohort,
  type JourneyCohortKey,
} from "@/modules/intelligence/journey";

import { resolveIntelligencePage } from "@/modules/intelligence/page-context";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/intelligence/journey";

export default async function CustomerJourneyPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const page = await resolveIntelligencePage(raw);
  if ("redirect" in page) redirect(page.redirect);

  const {
    organizationId,
    filters,
    current,
    stores,
    representatives,
    categories,
    intents,
    languages,
    storeCount,
    directoryError,
    selectedStoreName,
  } = page;

  const cohortKey: JourneyCohortKey =
    JOURNEY_COHORTS.find((key) => key === single(raw, "cohort")) ?? "high_intent";
  const cohort = selectCohort(current.rows, cohortKey);
  // Computed once and shared, so the count on a gap in the rail is the count of
  // interactions its link opens.
  const leakage = journeyLeakageCohorts(cohort);
  const storeName = new Map(stores.map((item) => [item.id, item.name]));

  // Compared by store where several are in scope, otherwise by category — a
  // single-store operator gets the comparison actually available to them rather
  // than a table with one row.
  const distinctStores = new Set(cohort.flatMap((row) => (row.locationId ? [row.locationId] : [])));
  const byStore = distinctStores.size > 1;

  const sizes = Object.fromEntries(
    JOURNEY_COHORTS.map((key) => [key, selectCohort(current.rows, key).length]),
  ) as Record<JourneyCohortKey, number>;

  const stages = journeyStages(cohort, leakage);
  // Page-local: which node's diagnosis is showing. Never carried to another
  // page, where it would mean nothing.
  const selectedStage =
    stages.find((stage) => stage.key === single(raw, "stage"))?.key ?? "entered";

  const openDrawer = single(raw, "drawer");
  const carry = { cohort: cohortKey, stage: selectedStage };

  return (
    <>
      <IntelligenceHead title="Journey" />
      <IntelligenceFilterBar
        basePath={BASE}
        filters={filters}
        stores={stores}
        categories={categories}
        representatives={representatives}
        intents={intents}
        languages={languages}
        interactions={current.rows.length}
        storeCount={storeCount}
        directoryError={directoryError}
        carry={carry}
      />
      <JourneyView
        cohortKey={cohortKey}
        cohortSizes={sizes}
        stages={stages}
        selectedStage={selectedStage}
        stageHref={(stageKey) =>
          intelligenceHref(BASE, filters, { ...carry, stage: stageKey, drawer: null })
        }
        diagnosis={journeyDiagnosis(
          cohort,
          stages,
          selectedStage,
          leakage,
          (row) => (byStore ? row.locationId : row.purchaseCategory),
          (key) => (byStore ? (storeName.get(key) ?? key) : key),
        )}
        lanes={interventions(cohort)}
        gaps={leakage}
        breakdown={journeyBreakdown(
          cohort,
          (row) => (byStore ? row.locationId : row.purchaseCategory),
          (key) => (byStore ? (storeName.get(key) ?? key) : key),
        )}
        breakdownLabel={byStore ? "Store" : "Category"}
        outcomes={outcomeDistributions(cohort)}
        products={productPath(cohort)}
        cohortHref={(key) =>
          intelligenceHref(BASE, filters, { cohort: key, stage: null, drawer: null })
        }
        gapHref={(key) => intelligenceHref(BASE, filters, { ...carry, drawer: key })}
        productHref={(fieldKey, value) =>
          intelligenceHref(BASE, filters, { ...carry, drawer: valueCohortKey(fieldKey, value) })
        }
      />
      {openDrawer ? (
        <IntelligenceDrawer
          organizationId={organizationId}
          rows={cohort}
          cohortKey={openDrawer}
          journeyCohort={cohortKey}
          scopeChips={[
            windowLabel(filters.days),
            selectedStoreName ?? `${storeCount} store${storeCount === 1 ? "" : "s"}`,
            filters.category ?? "All categories",
            `Cohort: ${cohortKey.replaceAll("_", " ")}`,
          ]}
          closeHref={intelligenceHref(BASE, filters, { ...carry, drawer: null })}
          fullHref={intelligenceHref(cohortPath(openDrawer), filters, carry)}
        />
      ) : null}
    </>
  );
}
