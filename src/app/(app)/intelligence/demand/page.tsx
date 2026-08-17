import { redirect } from "next/navigation";

import { DemandView } from "@/components/intelligence/demand-view";
import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  budgetPicture,
  clarityMatrix,
  computeDemand,
  distribution,
  nonConversionReasons,
  rankedShare,
} from "@/modules/intelligence/demand";
import { parseFilters, resolvePeriods, windowLabel } from "@/modules/intelligence/filters";
import { isUnresolved } from "@/modules/intelligence/outcome";
import { loadPopulation, type PopulationRow } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomerDemandPage({ searchParams }: PageProps) {
  const [context, raw] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, assignments, locations } = context.current;
  const filters = parseFilters(raw);
  const periods = resolvePeriods(filters);

  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores =
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id));
  const selectedStore = stores.find((item) => item.id === filters.storeId) ?? null;

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

  const rows = current.rows;
  // Purchase conditions read only from interactions that did not close, so the
  // panel is not diluted by customers who had nothing left to ask for.
  const unresolved: PopulationRow[] = rows.filter((row) => isUnresolved(row.outcome));

  const categories = [
    ...new Set(rows.flatMap((row) => (row.purchaseCategory ? [row.purchaseCategory] : []))),
  ].sort();

  return (
    <>
      <PageHeader eyebrow="Customer demand" title="Who walked in, and what stopped them" />
      <IntelligenceFilterBar
        basePath="/intelligence/demand"
        filters={filters}
        stores={stores.map((store) => ({ id: store.id, name: store.name }))}
        categories={categories}
      />
      <p className="fl-context">
        {rows.length} analysed interaction{rows.length === 1 ? "" : "s"} in {windowLabel(filters.days)}
        {selectedStore ? ` at ${selectedStore.name}` : ""}
        {previous ? `, against ${previous.rows.length} in the ${filters.days} days before` : ""}.
      </p>
      <DemandView
        metrics={computeDemand(rows)}
        previous={previous ? computeDemand(previous.rows) : null}
        budget={budgetPicture(rows)}
        clarity={clarityMatrix(rows)}
        categories={distribution(rows, (row) => row.purchaseCategory)}
        intents={distribution(rows, (row) => row.arrivalIntent)}
        useCases={rankedShare(rows, ["purchase_use_cases"])}
        requirements={rankedShare(rows, [
          "specification_requirements",
          "additional_requirements",
          "other_constraints",
        ])}
        drivers={rankedShare(rows, ["decision_drivers"])}
        brands={rankedShare(rows, ["brand_preferences"])}
        questions={rankedShare(rows, ["customer_questions"])}
        blockers={nonConversionReasons(rows)}
        conditions={rankedShare(unresolved, ["customer_purchase_conditions"])}
        periodLabel={windowLabel(filters.days)}
      />
    </>
  );
}
