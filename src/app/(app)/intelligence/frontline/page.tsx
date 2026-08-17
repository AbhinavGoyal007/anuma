import { redirect } from "next/navigation";

import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import { FrontlineIntelligenceView } from "@/components/intelligence/frontline-intelligence-view";
import { PageHeader } from "@/components/ui/page-header";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  filtersToQuery,
  parseFilters,
  resolvePeriods,
  windowLabel,
} from "@/modules/intelligence/filters";
import {
  computeFrontline,
  frontlineActionCohorts,
  outcomeAssociations,
} from "@/modules/intelligence/frontline";
import { loadPopulation } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FrontlineIntelligencePage({ searchParams }: PageProps) {
  const [context, raw] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, assignments, locations } = context.current;
  const filters = parseFilters(raw);
  const periods = resolvePeriods(filters);

  // A rep sees only the stores they are assigned to. Narrowing the options here
  // rather than in the query keeps an unassigned store from being selectable at
  // all, so a hand-typed id in the URL cannot widen what someone sees.
  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores =
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id));
  const selectedStore = stores.find((item) => item.id === filters.storeId) ?? null;

  // Both periods come from the same loader with the same filters, so a delta
  // cannot be a comparison between two differently-shaped populations.
  const [current, previous] = await Promise.all([
    loadPopulation({
      organizationId: organization.id,
      from: periods.current.from,
      to: periods.current.to,
      locationId: selectedStore?.id ?? null,
      purchaseCategory: filters.category,
    }),
    periods.previous
      ? loadPopulation({
          organizationId: organization.id,
          from: periods.previous.from,
          to: periods.previous.to,
          locationId: selectedStore?.id ?? null,
          purchaseCategory: filters.category,
        })
      : null,
  ]);

  const categories = [
    ...new Set(current.rows.flatMap((row) => (row.purchaseCategory ? [row.purchaseCategory] : []))),
  ].sort();

  return (
    <>
      <PageHeader
        eyebrow="Frontline intelligence"
        title="Where frontline execution needs attention"
      />
      <IntelligenceFilterBar
        basePath="/intelligence/frontline"
        filters={filters}
        stores={stores.map((store) => ({ id: store.id, name: store.name }))}
        categories={categories}
      />
      <p className="fl-context">
        {current.rows.length} analysed interaction{current.rows.length === 1 ? "" : "s"} in{" "}
        {windowLabel(filters.days)}
        {selectedStore ? ` at ${selectedStore.name}` : ""}
        {previous ? `, against ${previous.rows.length} in the ${filters.days} days before` : ""}.
      </p>
      <FrontlineIntelligenceView
        metrics={computeFrontline(current.rows)}
        previousMetrics={previous ? computeFrontline(previous.rows) : null}
        cohorts={frontlineActionCohorts(current.rows)}
        associations={outcomeAssociations(current.rows)}
        analysed={current.rows.length}
        withoutMetrics={current.withoutMetrics}
        periodLabel={windowLabel(filters.days)}
        cohortQuery={filtersToQuery(filters)}
      />
    </>
  );
}
