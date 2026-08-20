import { redirect } from "next/navigation";

import { IntelligenceDrawer } from "@/components/intelligence/intelligence-drawer";
import { IntelligenceFilterBar, IntelligenceHead } from "@/components/intelligence/filter-bar";
import { JourneyView } from "@/components/intelligence/journey-view";
import { cohortPath, valueCohortKey } from "@/modules/intelligence/cohorts";
import {
  FILTER_PARAM_KEYS,
  intelligenceHref,
  single,
  windowLabel,
} from "@/modules/intelligence/filters";
import {
  interventions,
  journeyBreakdown,
  journeyDiagnosis,
  DIAGNOSIS_ROWS,
  journeyLeakageCohorts,
  journeyStages,
  outcomeDistributions,
  productPath,
  JOURNEY_COHORTS,
  selectCohort,
  type JourneyCohortKey,
} from "@/modules/intelligence/journey";

import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import { scopeFingerprint } from "@/modules/intelligence/canonical";
import { readFindingReviews } from "@/modules/intelligence/pilot-store";
import {
  reviewableCohortKeys,
  reviewFindingKey,
} from "@/modules/intelligence/reviewable";
import { TelemetryScope } from "@/components/intelligence/telemetry";

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
    storeUnavailable,
    representativeUnnamed,
    selectedStoreName,
  } = page;

  const cohortKey: JourneyCohortKey =
    JOURNEY_COHORTS.find((key) => key === single(raw, "cohort")) ?? "high_intent";
  const cohort = selectCohort(current.rows, cohortKey);
  // Computed once and shared, so the count on a gap in the rail is the count of
  // interactions its link opens.
  const leakage = journeyLeakageCohorts(cohort);
  const storeName = new Map(stores.map((item) => [item.id, item.name]));

  // The breakdown dimension is the reader's choice. Switching it because one
  // had more rows moved the page under them between mornings.
  const dimension = single(raw, "dimension") === "categories" ? "categories" : "stores";

  const sizes = Object.fromEntries(
    JOURNEY_COHORTS.map((key) => [key, selectCohort(current.rows, key).length]),
  ) as Record<JourneyCohortKey, number>;

  const stages = journeyStages(cohort, leakage);

  const openDrawer = single(raw, "drawer");
  // The same registry the save path uses, so a manager cannot answer a
  // finding the page never offered.
  const reviewableKeys = new Set(reviewableCohortKeys("journey", current.rows));
  // What the reader actually narrowed to, carried with every pilot event so a
  // finding can be traced back to the population it was read from.
  const activeFilters = Object.fromEntries(
    FILTER_PARAM_KEYS.flatMap((key) => {
      const chosen = single(raw, key);
      return chosen ? [[key, chosen] as const] : [];
    }),
  );
  const scope = scopeFingerprint({
    from: page.periods.current.from,
    to: page.periods.current.to,
    filters: Object.fromEntries(FILTER_PARAM_KEYS.map((key) => [key, single(raw, key)])),
  });
  const reviews =
    openDrawer && reviewableKeys.has(openDrawer)
      ? await readFindingReviews(organizationId, page.membershipId, scope)
      : new Map();
  const carry: Record<string, string> = { cohort: cohortKey, dimension };

  return (
    <TelemetryScope
      page="journey"
      scopeFingerprint={scope}
      filters={activeFilters}
      drawerKey={openDrawer}
    >
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
        coverage={current.coverage}
        directoryError={directoryError}
        storeUnavailable={storeUnavailable}
        representativeUnnamed={representativeUnnamed}
        carry={carry}
      />
      <JourneyView
        cohortKey={cohortKey}
        cohortSizes={sizes}
        stages={stages}
        diagnosis={journeyDiagnosis(leakage)}
        lanes={interventions(cohort)}
        gaps={leakage}
        breakdowns={{
          stores: journeyBreakdown(
            cohort,
            (row) => row.locationId,
            (key) => storeName.get(key) ?? key,
          ),
          categories: journeyBreakdown(
            cohort,
            (row) => row.purchaseCategory,
            (key) => key,
          ),
        }}
        breakdownDimension={dimension}
        breakdownHref={(next) => intelligenceHref(BASE, filters, { ...carry, dimension: next })}
        outcomes={outcomeDistributions(cohort)}
        products={productPath(cohort)}
        cohortHref={(key) => intelligenceHref(BASE, filters, { cohort: key, drawer: null })}
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
          review={
            reviewableKeys.has(openDrawer)
              ? {
                  page: "journey",
                  filters: activeFilters,
                  returnPath: BASE,
                  existing: reviews.get(reviewFindingKey("journey", openDrawer)) ?? null,
                }
              : null
          }
        />
      ) : null}
    </TelemetryScope>
  );
}
