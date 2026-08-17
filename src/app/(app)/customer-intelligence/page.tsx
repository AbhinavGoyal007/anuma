import Link from "next/link";
import { redirect } from "next/navigation";

import { DemandIntelligenceView } from "@/components/intelligence/demand-intelligence-view";
import { StoreComparisonTable } from "@/components/intelligence/store-comparison";
import { TrendPanel, type PeriodLink } from "@/components/intelligence/trend-panel";
import { PageHeader } from "@/components/ui/page-header";
import { getApplicationRoute } from "@/modules/application/routes";
import { getApplicationContext } from "@/modules/identity/application-context";
import { getDemandIntelligence } from "@/modules/interaction-metrics/aggregate";
import { getStoreComparison } from "@/modules/interaction-metrics/stores";
import { getDemandTrend } from "@/modules/interaction-metrics/trends";

type PageProps = { searchParams: Promise<{ store?: string; period?: string }> };

/** Comparison periods a reader can pick; anything else falls back to 30 days. */
const PERIOD_OPTIONS = [7, 30, 90] as const;

export default async function CustomerIntelligencePage({ searchParams }: PageProps) {
  const [context, params] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, assignments, locations } = context.current;
  const route = getApplicationRoute("/customer-intelligence");

  // A rep sees only the stores they are assigned to; an admin sees them all.
  // Filtering here rather than in the query keeps an unassigned store from even
  // appearing as a selectable option.
  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores =
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id));

  // A selected store must be one the viewer may see; anything else falls back to
  // the whole organization rather than showing an empty or forbidden slice.
  const selectedStore = stores.find((item) => item.id === params.store) ?? null;

  const parsedPeriod = Number(params.period);
  const periodDays = PERIOD_OPTIONS.includes(parsedPeriod as (typeof PERIOD_OPTIONS)[number])
    ? parsedPeriod
    : 30;

  const scope = selectedStore ? { locationId: selectedStore.id } : {};

  const [data, trend, storeComparison] = await Promise.all([
    getDemandIntelligence(organization.id, scope),
    getDemandTrend(organization.id, { ...scope, periodDays }),
    // Comparing stores only makes sense across them, so it is skipped entirely
    // when the reader has narrowed to one.
    selectedStore ? Promise.resolve(null) : getStoreComparison(organization.id),
  ]);

  const periodLinks: PeriodLink[] = PERIOD_OPTIONS.map((days) => {
    const query = new URLSearchParams();
    if (selectedStore) query.set("store", selectedStore.id);
    query.set("period", String(days));
    return {
      days,
      href: `/customer-intelligence?${query.toString()}`,
      active: days === periodDays,
    };
  });
  const storeNames = new Map(locations.map((item) => [item.id, item.name]));

  return (
    <>
      <PageHeader
        eyebrow={route.eyebrow}
        title={
          selectedStore ? `Demand Intelligence · ${selectedStore.name}` : "Demand Intelligence"
        }
      />

      {stores.length > 0 ? (
        <nav className="store-filter" aria-label="Filter by store">
          <Link
            href={`/customer-intelligence?period=${periodDays}`}
            className={`store-chip${selectedStore ? "" : " store-chip--active"}`}
          >
            All stores
          </Link>
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/customer-intelligence?store=${store.id}&period=${periodDays}`}
              className={`store-chip${selectedStore?.id === store.id ? " store-chip--active" : ""}`}
            >
              {store.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <TrendPanel trend={trend} periods={periodLinks} />

      {storeComparison ? (
        <StoreComparisonTable comparison={storeComparison} storeNames={storeNames} />
      ) : null}

      <DemandIntelligenceView data={data} />
    </>
  );
}
