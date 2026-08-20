import { redirect } from "next/navigation";

import { CoverageDrawer } from "@/components/intelligence/coverage-drawer";
import { IntelligenceFilterBar, IntelligenceHead } from "@/components/intelligence/filter-bar";
import { IntelligenceDrawer } from "@/components/intelligence/intelligence-drawer";
import { OverviewView } from "@/components/intelligence/overview-view";
import { cohortPath, numeratorCohortKey } from "@/modules/intelligence/cohorts";
import { intelligenceHref, single, windowLabel } from "@/modules/intelligence/filters";
import {
  overviewBreakdown,
  overviewPriorityActions,
  overviewPulse,
  overviewSignals,
  type BreakdownDimension,
} from "@/modules/intelligence/overview";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import { scopeHash, SCOPE_KEYS } from "@/modules/intelligence/pilot";
import { readFindingReviews, recordIntelligenceView } from "@/modules/intelligence/pilot-store";
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
  const priorityKeys = new Set(
    overviewPriorityActions(rows).flatMap((cohort) => (cohort ? [cohort.key] : [])),
  );
  const scope = scopeHash(Object.fromEntries(SCOPE_KEYS.map((key) => [key, single(raw, key)])));
  const reviews =
    openDrawer && priorityKeys.has(openDrawer)
      ? await readFindingReviews(organizationId, scope)
      : new Map();

  // Recorded from the URL, which is the record of what the manager asked for.
  await recordIntelligenceView({
    organizationId,
    membershipId: page.membershipId,
    page: "overview",
    sessionId: scope,
    filters: Object.fromEntries(
      SCOPE_KEYS.flatMap((key) => {
        const chosen = single(raw, key);
        return chosen ? [[key, chosen] as const] : [];
      }),
    ),
    drawer: openDrawer,
    drawerIsPriority: openDrawer ? priorityKeys.has(openDrawer) : false,
    drawerIsNumerator: openDrawer?.startsWith("numerator:") ?? false,
  });

  return (
    <>
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
      />
      <OverviewView
        coverage={current.coverage}
        coverageHref={intelligenceHref(BASE, filters, { ...carry, drawer: "coverage" })}
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
        breakdown={overviewBreakdown(
          rows,
          (row) => (dimension === "stores" ? row.locationId : row.purchaseCategory),
          (key) => (dimension === "stores" ? (storeName.get(key) ?? key) : key),
        )}
        breakdownDimension={dimension}
        breakdownHref={(next) => intelligenceHref(BASE, filters, { ...carry, dimension: next })}
        breakdownRowHref={(key) =>
          intelligenceHref(
            BASE,
            dimension === "stores" ? { ...filters, storeId: key } : { ...filters, category: key },
            carry,
          )
        }
        breakdownCellHref={(key, measureKey) =>
          intelligenceHref(
            BASE,
            dimension === "stores" ? { ...filters, storeId: key } : { ...filters, category: key },
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
            priorityKeys.has(openDrawer)
              ? {
                  findingKey: `overview_priority:${openDrawer}`,
                  scopeHash: scope,
                  page: "overview",
                  returnPath: BASE,
                  existing: reviews.get(`overview_priority:${openDrawer}:${openDrawer}`) ?? null,
                }
              : null
          }
        />
      ) : null}
    </>
  );
}
