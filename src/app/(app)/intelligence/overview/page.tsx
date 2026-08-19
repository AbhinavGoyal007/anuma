import { redirect } from "next/navigation";

import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import {
  OverviewView,
  overviewMoney,
  overviewPercent,
  type PulseItem,
} from "@/components/intelligence/overview-view";
import { PageHeader } from "@/components/ui/page-header";
import {
  changeCandidates,
  gapCandidates,
  rankCandidates,
  suppressionReason,
} from "@/modules/intelligence/candidates";
import { budgetPicture, clarityMatrix, computeDemand } from "@/modules/intelligence/demand";
import { comparisonLabel, filtersToQuery, windowLabel } from "@/modules/intelligence/filters";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import { computeFrontline, frontlineActionCohorts } from "@/modules/intelligence/frontline";
import { journeyLeakageCohorts } from "@/modules/intelligence/journey";
import { loadPopulation } from "@/modules/intelligence/population";
import { selectPrincipalSeries, TREND_METRICS, buildSeries } from "@/modules/intelligence/trend";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function IntelligenceOverviewPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const page = await resolveIntelligencePage(raw);
  if ("redirect" in page) redirect(page.redirect);

  const { filters, current, previous, stores, representatives, categories, selectedStoreName } =
    page;

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

  // Deterministic statements about where things stand, for the periods where a
  // comparison cannot be made. Each is a fact with its denominator attached, not
  // a trend wearing a fact's clothes.
  const currentPicture = [
    {
      key: "analysed",
      sentence: `${current.rows.length} interaction${current.rows.length === 1 ? "" : "s"} analysed in ${windowLabel(filters.days)}.`,
      detail: selectedStoreName ? `At ${selectedStoreName}.` : undefined,
    },
    demand.highIntent.value !== null
      ? {
          key: "intent",
          sentence: `${demand.highIntent.affected} of ${demand.highIntent.observed} customers whose intent could be classified arrived already decided.`,
        }
      : null,
    demand.financeDemand.value !== null
      ? {
          key: "finance",
          sentence: `Finance was raised in ${demand.financeDemand.affected} of ${demand.financeDemand.observed} interactions.`,
        }
      : null,
    clarity.improved.value !== null
      ? {
          key: "clarity",
          sentence: `Requirements became clearer in ${clarity.improved.affected} of ${clarity.improved.observed} interactions where both states were readable.`,
        }
      : null,
    gaps[0]
      ? {
          key: "gap",
          sentence: `Largest execution gap: ${gaps[0].headline}`,
          detail: gaps[0].soWhat,
        }
      : null,
  ].flatMap((fact) => (fact ? [fact] : []));

  // The tracked signal. A reader can switch it, but only among the signals that
  // cleared their own guardrails — the picker never offers a line we would
  // refuse to draw.
  const picked = selectPrincipalSeries(current.rows, filters.days);
  const requestedSignal = Array.isArray(raw.signal) ? raw.signal[0] : raw.signal;
  const chosen =
    picked && requestedSignal
      ? (picked.available.find((metric) => metric.key === requestedSignal) ?? null)
      : null;
  const tracking = picked
    ? {
        series: chosen ? buildSeries(current.rows, chosen, filters.days) : picked.series,
        available: picked.available,
      }
    : null;
  const trackingHref = (key: string) => {
    const query = filtersToQuery(filters);
    return `/intelligence/overview${query}${query ? "&" : "?"}signal=${key}`;
  };

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
        stores={stores}
        categories={categories}
        representatives={representatives}
      />
      <OverviewView
        changes={changes}
        currentPicture={currentPicture}
        tracking={tracking}
        trackingHref={trackingHref}
        gaps={gaps}
        pulse={pulse}
        analysed={current.rows.length}
        previousAnalysed={previous ? previous.rows.length : null}
        suppression={suppressionReason(current.rows.length, previous ? previous.rows.length : null)}
        periodLabel={windowLabel(filters.days)}
        comparisonLabel={comparisonLabel(filters.days)}
      />
    </>
  );
}
