import { redirect } from "next/navigation";

import { DemandView, NEED_TABS, type NeedTabKey } from "@/components/intelligence/demand-view";
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
import { filtersToQuery, windowLabel } from "@/modules/intelligence/filters";
import { isUnresolved } from "@/modules/intelligence/outcome";
import { loadPopulation, type PopulationRow } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomerDemandPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const page = await resolveIntelligencePage(raw);
  if ("redirect" in page) redirect(page.redirect);

  const { filters, current, previous, stores, representatives, categories, selectedStoreName } =
    page;
  const rows = current.rows;
  // Purchase conditions read only from interactions that did not close, so the
  // panel is not diluted by customers who had nothing left to ask for.
  const unresolved: PopulationRow[] = rows.filter((row) => isUnresolved(row.outcome));

  // Which need list is showing, and whether it is expanded. Both live in the
  // URL like every other selection here, so a narrowed view stays shareable and
  // the control works without JavaScript.
  const requestedNeed = Array.isArray(raw.need) ? raw.need[0] : raw.need;
  const need: NeedTabKey = NEED_TABS.find((tab) => tab.key === requestedNeed)?.key ?? "use_cases";
  const expanded = (Array.isArray(raw.all) ? raw.all[0] : raw.all) === "1";
  // Expanding has to mean everything, or "Show all 10" would be a promise the
  // page does not keep when the underlying list is longer than ten.
  const listLimit = expanded ? Number.MAX_SAFE_INTEGER : 12;
  const withParams = (extra: Record<string, string>) => {
    const query = filtersToQuery(filters).replace(/^\?/, "");
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    return `/intelligence/demand?${params.toString()}`;
  };

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
        useCases={rankedShare(rows, ["purchase_use_cases"], listLimit)}
        requirements={rankedShare(
          rows,
          ["specification_requirements", "additional_requirements", "other_constraints"],
          listLimit,
        )}
        drivers={rankedShare(rows, ["decision_drivers"], listLimit)}
        brands={rankedShare(rows, ["brand_preferences"], listLimit)}
        questions={rankedShare(rows, ["customer_questions"])}
        blockers={nonConversionReasons(rows)}
        conditions={rankedShare(unresolved, ["customer_purchase_conditions"])}
        periodLabel={windowLabel(filters.days)}
        need={need}
        needHref={(key) => withParams({ need: key })}
        expandHref={expanded ? null : withParams({ need, all: "1" })}
      />
    </>
  );
}
