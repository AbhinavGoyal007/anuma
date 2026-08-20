import { redirect } from "next/navigation";

import { CoverageDrawer } from "@/components/intelligence/coverage-drawer";
import { IntelligenceFilterBar, IntelligenceHead } from "@/components/intelligence/filter-bar";
import { IntelligenceDrawer } from "@/components/intelligence/intelligence-drawer";
import { OverviewView } from "@/components/intelligence/overview-view";
import { cohortPath, numeratorCohortKey } from "@/modules/intelligence/cohorts";
import {
  FILTER_PARAM_KEYS,
  intelligenceHref,
  single,
  windowLabel,
} from "@/modules/intelligence/filters";
import {
  overviewBreakdown,
  overviewPriorityActions,
  overviewPulse,
  overviewSignals,
  type BreakdownDimension,
} from "@/modules/intelligence/overview";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import { scopeFingerprint } from "@/modules/intelligence/canonical";
import { readFindingReviews } from "@/modules/intelligence/pilot-store";
import {
  reviewableCohortKeys,
  reviewFindingKey,
} from "@/modules/intelligence/reviewable";
import { TelemetryScope } from "@/components/intelligence/telemetry";
import { buildSeries, qualifies, TREND_METRICS } from "@/modules/intelligence/trend";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/intelligence/overview";

export default async function IntelligenceOverviewPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const page = await resolveIntelligencePage(raw);
  if ("redirect" in page) redirect(page.redirect);

  const {
    organizationId,
    filters,
    current,
    previous,
    stores,
    representatives,
    categories,
    intents,
    languages,
    storeCount,
    selectedStoreName,
    directoryError,
    storeUnavailable,
    representativeUnnamed,
    analyticalFiltersActive,
  } = page;
  const rows = current.rows;

  // The tracked signal is chosen by the reader, never by the data. The six tabs
  // are the same six every day; if the selected one cannot carry a line, that
  // slot says so rather than promoting whichever metric happened to move.
  const trendMetric =
    TREND_METRICS.find((metric) => metric.key === single(raw, "signal")) ?? TREND_METRICS[0]!;
  const series = buildSeries(rows, trendMetric, filters.days);
  const trend = qualifies(series) ? series : null;

  // The breakdown dimension is a reader's choice too. Auto-switching to
  // whichever had more rows moved the page under them between mornings.
  const dimension: BreakdownDimension =
    single(raw, "dimension") === "categories" ? "categories" : "stores";
  const storeName = new Map(stores.map((item) => [item.id, item.name]));

  const openDrawer = single(raw, "drawer");
  const carry: Record<string, string> = { signal: trendMetric.key, dimension };

  // Review Outcome appears only on a priority action — a thing the product is
  // asking somebody to do — never under a descriptive tile.
  // The same registry the save path uses, so a manager cannot answer a
  // finding the page never offered.
  const reviewableKeys = new Set(reviewableCohortKeys("overview", rows));
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

  return (
    <TelemetryScope
      page="overview"
      scopeFingerprint={scope}
      filters={activeFilters}
      drawerKey={openDrawer}
    >
      <IntelligenceHead title="Overview" />
      <IntelligenceFilterBar
        basePath={BASE}
        filters={filters}
        stores={stores}
        categories={categories}
        representatives={representatives}
        intents={intents}
        languages={languages}
        interactions={rows.length}
        storeCount={storeCount}
        coverage={current.coverage}
        carry={carry}
        directoryError={directoryError}
        storeUnavailable={storeUnavailable}
        representativeUnnamed={representativeUnnamed}
      />
      <OverviewView
        coverage={current.coverage}
        coverageHref={intelligenceHref(BASE, filters, { ...carry, drawer: "coverage" })}
        analyticalFiltersActive={analyticalFiltersActive}
        signals={overviewSignals(rows, previous ? previous.rows : null)}
        actions={overviewPriorityActions(rows)}
        actionHref={(cohortKey) => intelligenceHref(BASE, filters, { ...carry, drawer: cohortKey })}
        numeratorHref={(measureKey) =>
          intelligenceHref(BASE, filters, { ...carry, drawer: numeratorCohortKey(measureKey) })
        }
        pulse={overviewPulse(rows, previous ? previous.rows : null)}
        trend={trend}
        trendMetrics={TREND_METRICS}
        trendMetricKey={trendMetric.key}
        trendHref={(key) => intelligenceHref(BASE, filters, { ...carry, signal: key })}
        // Both dimensions, from the rows already in memory, so switching the
        // tab costs nothing and genuinely changes the table.
        breakdowns={{
          stores: overviewBreakdown(
            rows,
            (row) => row.locationId,
            (key) => storeName.get(key) ?? key,
          ),
          categories: overviewBreakdown(
            rows,
            (row) => row.purchaseCategory,
            (key) => key,
          ),
        }}
        breakdownDimension={dimension}
        breakdownHref={(next) => intelligenceHref(BASE, filters, { ...carry, dimension: next })}
        breakdownRowHref={(which, key) =>
          intelligenceHref(
            BASE,
            which === "stores" ? { ...filters, storeId: key } : { ...filters, category: key },
            carry,
          )
        }
        breakdownCellHref={(which, key, measureKey) =>
          intelligenceHref(
            BASE,
            which === "stores" ? { ...filters, storeId: key } : { ...filters, category: key },
            { ...carry, drawer: numeratorCohortKey(measureKey) },
          )
        }
        usable={rows.length}
      />
      {openDrawer === "coverage" ? (
        <CoverageDrawer
          coverage={current.coverage}
          closeHref={intelligenceHref(BASE, filters, { ...carry, drawer: null })}
        />
      ) : openDrawer ? (
        <IntelligenceDrawer
          organizationId={organizationId}
          rows={rows}
          cohortKey={openDrawer}
          journeyCohort="all"
          scopeChips={[
            windowLabel(filters.days),
            selectedStoreName ?? `${storeCount} store${storeCount === 1 ? "" : "s"}`,
            filters.category ?? "All categories",
          ]}
          closeHref={intelligenceHref(BASE, filters, { ...carry, drawer: null })}
          fullHref={intelligenceHref(cohortPath(openDrawer), filters)}
          review={
            reviewableKeys.has(openDrawer)
              ? {
                  page: "overview",
                  filters: activeFilters,
                  returnPath: BASE,
                  existing:
                    reviews.get(reviewFindingKey("overview", openDrawer)) ?? null,
                }
              : null
          }
        />
      ) : null}
    </TelemetryScope>
  );
}
