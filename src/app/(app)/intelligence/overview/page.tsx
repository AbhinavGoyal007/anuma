import { redirect } from "next/navigation";

import { IntelligenceDrawer } from "@/components/intelligence/intelligence-drawer";
import { IntelligenceFilterBar, IntelligenceHead } from "@/components/intelligence/filter-bar";
import { OverviewView } from "@/components/intelligence/overview-view";
import { cohortPath, numeratorCohortKey } from "@/modules/intelligence/cohorts";
import { intelligenceHref, single, windowLabel } from "@/modules/intelligence/filters";
import {
  hotspots,
  overviewActions,
  overviewPulse,
  overviewSignals,
} from "@/modules/intelligence/overview";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import { buildSeries, selectPrincipalSeries } from "@/modules/intelligence/trend";

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
    directoryError,
    selectedStoreName,
  } = page;
  const rows = current.rows;

  // The tracked signal. A reader can switch it, but only among the signals that
  // cleared their own guardrails — the picker never offers a line we would
  // refuse to draw.
  const picked = selectPrincipalSeries(rows, filters.days);
  const requestedSignal = single(raw, "signal");
  const chosen =
    picked && requestedSignal
      ? (picked.available.find((metric) => metric.key === requestedSignal) ?? null)
      : null;
  const trend = picked ? (chosen ? buildSeries(rows, chosen, filters.days) : picked.series) : null;

  // Compared by store where several are in scope, otherwise by category — a
  // single-store operator gets the comparison actually available to them.
  const storeName = new Map(stores.map((item) => [item.id, item.name]));
  const distinctStores = new Set(rows.flatMap((row) => (row.locationId ? [row.locationId] : [])));
  const byStore = distinctStores.size > 1;

  const openDrawer = single(raw, "drawer");
  const carry: Record<string, string> = requestedSignal ? { signal: requestedSignal } : {};

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
        directoryError={directoryError}
        carry={carry}
      />
      <OverviewView
        signals={overviewSignals(rows, previous ? previous.rows : null)}
        actions={overviewActions(rows)}
        actionHref={(cohortKey) => intelligenceHref(BASE, filters, { ...carry, drawer: cohortKey })}
        numeratorHref={(measureKey) =>
          intelligenceHref(BASE, filters, { ...carry, drawer: numeratorCohortKey(measureKey) })
        }
        pulse={overviewPulse(rows, previous ? previous.rows : null)}
        trend={trend}
        trendMetrics={picked ? [...picked.available] : []}
        trendHref={(key) => intelligenceHref(BASE, filters, { ...carry, signal: key })}
        // No safe action exists yet. The period filter offers rolling windows
        // relative to today, not an arbitrary past week, so a point cannot
        // narrow the page to the period it stands for. Rather than a link that
        // silently lands somewhere else, the point stays a described,
        // focusable, non-interactive mark — which is what the reader can trust.
        trendPointHref={() => null}
        hotspots={hotspots(
          rows,
          (row) => (byStore ? row.locationId : row.purchaseCategory),
          (key) => (byStore ? (storeName.get(key) ?? key) : key),
        )}
        hotspotLabel={byStore ? "Store" : "Category"}
        hotspotHref={(key) =>
          intelligenceHref(
            BASE,
            byStore ? { ...filters, storeId: key } : { ...filters, category: key },
            carry,
          )
        }
        hotspotCellHref={(key, measureKey) =>
          intelligenceHref(
            BASE,
            byStore ? { ...filters, storeId: key } : { ...filters, category: key },
            { ...carry, drawer: numeratorCohortKey(measureKey) },
          )
        }
        analysed={rows.length}
      />
      {openDrawer ? (
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
        />
      ) : null}
    </>
  );
}
