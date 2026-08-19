import { redirect } from "next/navigation";

import { DemandView } from "@/components/intelligence/demand-view";
import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import {
  budgetPicture,
  clarityMatrix,
  computeDemand,
  distribution,
  nonConversionReasons,
  rankedShare,
} from "@/modules/intelligence/demand";
import { windowLabel } from "@/modules/intelligence/filters";
import { isUnresolved } from "@/modules/intelligence/outcome";
import { loadPopulation, type PopulationRow } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomerDemandPage({ searchParams }: PageProps) {
  const page = await resolveIntelligencePage(await searchParams);
  if ("redirect" in page) redirect(page.redirect);

  const { filters, current, previous, stores, representatives, categories, selectedStoreName } =
    page;
  const rows = current.rows;
  // Purchase conditions read only from interactions that did not close, so the
  // panel is not diluted by customers who had nothing left to ask for.
  const unresolved: PopulationRow[] = rows.filter((row) => isUnresolved(row.outcome));

  return (
    <>
      <PageHeader eyebrow="Customer demand" title="Who walked in, and what stopped them" />
      <IntelligenceFilterBar
        basePath="/intelligence/demand"
        filters={filters}
        stores={stores}
        categories={categories}
        representatives={representatives}
      />
      <p className="fl-context">
        {rows.length} analysed interaction{rows.length === 1 ? "" : "s"} in{" "}
        {windowLabel(filters.days)}
        {selectedStoreName ? ` at ${selectedStoreName}` : ""}
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
