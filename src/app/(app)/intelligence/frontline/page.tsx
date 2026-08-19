import { redirect } from "next/navigation";

import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import { FrontlineIntelligenceView } from "@/components/intelligence/frontline-intelligence-view";
import { PageHeader } from "@/components/ui/page-header";
import { filtersToQuery, windowLabel } from "@/modules/intelligence/filters";
import {
  computeFrontline,
  frontlineActionCohorts,
  outcomeAssociations,
  responseCompositions,
} from "@/modules/intelligence/frontline";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FrontlineIntelligencePage({ searchParams }: PageProps) {
  const page = await resolveIntelligencePage(await searchParams);
  if ("redirect" in page) redirect(page.redirect);

  const { filters, current, previous, stores, representatives, categories, selectedStoreName } =
    page;

  return (
    <>
      <PageHeader
        eyebrow="Frontline intelligence"
        title="Where frontline execution needs attention"
      />
      <IntelligenceFilterBar
        basePath="/intelligence/frontline"
        filters={filters}
        stores={stores}
        categories={categories}
        representatives={representatives}
      />
      <p className="fl-context">
        {current.rows.length} analysed interaction{current.rows.length === 1 ? "" : "s"} in{" "}
        {windowLabel(filters.days)}
        {selectedStoreName ? ` at ${selectedStoreName}` : ""}
        {previous ? `, against ${previous.rows.length} in the ${filters.days} days before` : ""}.
      </p>
      <FrontlineIntelligenceView
        metrics={computeFrontline(current.rows)}
        compositions={responseCompositions(current.rows)}
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
