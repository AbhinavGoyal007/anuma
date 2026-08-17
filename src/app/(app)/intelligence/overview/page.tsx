import { redirect } from "next/navigation";

import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import {
  OverviewView,
  overviewMoney,
  overviewPercent,
  type PulseItem,
} from "@/components/intelligence/overview-view";
import { PageHeader } from "@/components/ui/page-header";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  changeCandidates,
  gapCandidates,
  rankCandidates,
  suppressionReason,
} from "@/modules/intelligence/candidates";
import { budgetPicture, clarityMatrix, computeDemand } from "@/modules/intelligence/demand";
import {
  comparisonLabel,
  filtersToQuery,
  parseFilters,
  resolvePeriods,
  windowLabel,
} from "@/modules/intelligence/filters";
import { computeFrontline, frontlineActionCohorts } from "@/modules/intelligence/frontline";
import { journeyLeakageCohorts } from "@/modules/intelligence/journey";
import { loadPopulation } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function IntelligenceOverviewPage({ searchParams }: PageProps) {
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

  const demand = computeDemand(current.rows);
  const previousDemand = previous ? computeDemand(previous.rows) : null;
  const frontline = computeFrontline(current.rows);
  const previousFrontline = previous ? computeFrontline(previous.rows) : null;
  const budget = budgetPicture(current.rows);
  const clarity = clarityMatrix(current.rows);
  const query = filtersToQuery(filters);

  // Both kinds of gap, ranked together. A manager does not care whether a missed
  // close was filed under Frontline or under Journey.
  const gaps = rankCandidates(
    gapCandidates(
      [...frontlineActionCohorts(current.rows), ...journeyLeakageCohorts(current.rows)],
      query,
    ),
  );
  const changes = rankCandidates(changeCandidates(demand, previousDemand));

  const pulse: PulseItem[] = [
    {
      key: "analysed",
      label: "Analysed interactions",
      display: String(current.rows.length),
      measure: null,
    },
    {
      key: "high_intent",
      label: "Arrived decided",
      display: overviewPercent(demand.highIntent.value),
      measure: demand.highIntent,
      previous: previousDemand?.highIntent,
    },
    {
      key: "budget",
      label: "Median stated budget",
      display: overviewMoney(budget.targetMedian, budget.currency),
      measure: null,
    },
    {
      key: "clarity",
      label: "Requirements became clearer",
      display: overviewPercent(clarity.improved.value),
      measure: clarity.improved,
    },
    {
      key: "close",
      label: "Buying signal followed by a close",
      display: overviewPercent(frontline.closeAfterCommitment.value),
      measure: frontline.closeAfterCommitment,
      previous: previousFrontline?.closeAfterCommitment,
    },
    {
      key: "outcome",
      label: "Outcome established",
      display: overviewPercent(demand.outcomeClassified.value),
      measure: demand.outcomeClassified,
      previous: previousDemand?.outcomeClassified,
    },
  ];

  return (
    <>
      <PageHeader eyebrow="Intelligence" title="What changed, and what needs doing" />
      <IntelligenceFilterBar
        basePath="/intelligence/overview"
        filters={filters}
        stores={stores.map((store) => ({ id: store.id, name: store.name }))}
        categories={[
          ...new Set(
            current.rows.flatMap((row) => (row.purchaseCategory ? [row.purchaseCategory] : [])),
          ),
        ].sort()}
      />
      <OverviewView
        changes={changes}
        gaps={gaps}
        pulse={pulse}
        analysed={current.rows.length}
        previousAnalysed={previous ? previous.rows.length : null}
        suppression={suppressionReason(
          current.rows.length,
          previous ? previous.rows.length : null,
        )}
        periodLabel={windowLabel(filters.days)}
        comparisonLabel={comparisonLabel(filters.days)}
      />
    </>
  );
}
