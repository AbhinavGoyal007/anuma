import { render, type RenderResult } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DemandView,
  NEED_FIELD_KEYS,
  NEED_TABS,
  VOICE_TABS,
} from "@/components/intelligence/demand-view";
import {
  FrontlineIntelligenceView,
  STAGES,
} from "@/components/intelligence/frontline-intelligence-view";
import { JourneyView } from "@/components/intelligence/journey-view";
import { OverviewView } from "@/components/intelligence/overview-view";
import {
  budgetPicture,
  clarityMatrix,
  computeDemand,
  contextPrices,
  distribution,
  nonConversionReasons,
  originStrip,
  rankedShare,
} from "@/modules/intelligence/demand";
import {
  computeFrontline,
  expandDetail,
  nextActions,
  offerDetail,
  outcomeAssociations,
  questionResponseComposition,
  responseCompositions,
} from "@/modules/intelligence/frontline";
import { measure } from "@/modules/intelligence/guardrails";
import {
  interventions,
  journeyBreakdown,
  journeyDiagnosis,
  journeyLeakageCohorts,
  journeyStages,
  outcomeDistributions,
  productPath,
  selectCohort,
} from "@/modules/intelligence/journey";
import {
  overviewBreakdown,
  overviewPriorityActions,
  overviewPulse,
  overviewSignals,
} from "@/modules/intelligence/overview";
import type { PopulationRow } from "@/modules/intelligence/population";
import { TREND_METRICS } from "@/modules/intelligence/trend";
import { notStated, row, value } from "../support/population";

/**
 * The data changes the answer. It does not change the dashboard.
 *
 * Two populations that differ in almost every way a retail estate can differ —
 * one multi-store with common finance and wide commitment gaps, one single-store
 * with rare finance, heavy competitor pressure and unclear requirements — must
 * produce the same sections, in the same order, with the same metrics in the
 * same positions. A manager who opens this every morning should never have to
 * re-read the page to find out where their number went.
 *
 * Only values, ranked rows, priority-action identities and data-state content
 * may differ. Everything else moving is a defect.
 */

const EMPTY_COVERAGE = {
  recordedInteractions: 0,
  recordingFiles: 0,
  recordingHours: 0,
  recordingDurationUnavailableFiles: 0,
  transcription: { completed: 0, inProgress: 0, failed: 0, cancelled: 0, notStarted: 0 },
  transcribedInteractions: 0,
  analysis: { completed: 0, inProgress: 0, failed: 0, cancelled: 0, notStarted: 0 },
  analysedInteractions: 0,
  usableInteractions: 0,
  notUsableInteractions: 0,
  outcomeKnown: measure(0, 0, 0),
  evidenceReady: measure(0, 0, 0),
  usableConversationIds: [] as string[],
  currentRecordIdByConversation: new Map<string, string>(),
};

/** Multiple stores, finance common, competitors rare, commitment gaps wide. */
function datasetA(): PopulationRow[] {
  return Array.from({ length: 40 }, (_, index) =>
    row({
      locationId: index % 3 === 0 ? "store-a" : index % 3 === 1 ? "store-b" : "store-c",
      values: [
        value("purchase_category", index % 2 === 0 ? "laptop" : "smartphone"),
        value("arrival_intent_state", index % 4 === 0 ? "ready_to_buy" : "exploratory"),
        value("requirement_clarity_start", "low"),
        value("requirement_clarity_end", index % 3 === 0 ? "high" : "low"),
        index % 2 === 0 ? value("finance_requested", "EMI") : notStated("finance_requested"),
        index % 9 === 0 ? value("competitor_named", "Croma") : notStated("competitor_named"),
        value("products_recommended", "Acer Swift"),
        value("objections", "price"),
        value("customer_commitment_signals", "I'll take it", { earliestMs: 10_000 }),
        notStated("close_attempts"),
        notStated("next_action"),
        value("confirmed_business_outcome", index % 5 === 0 ? "sale" : "no_sale"),
      ],
    }),
  );
}

/** One store, finance rare, competitors everywhere, requirements unclear. */
function datasetB(): PopulationRow[] {
  return Array.from({ length: 24 }, (_, index) =>
    row({
      locationId: "store-only",
      values: [
        value("purchase_category", "television"),
        value("arrival_intent_state", "comparing"),
        value("requirement_clarity_start", "low"),
        value("requirement_clarity_end", "low"),
        index % 12 === 0 ? value("finance_requested", "EMI") : notStated("finance_requested"),
        value("competitor_named", index % 2 === 0 ? "Reliance Digital" : "Vijay Sales"),
        notStated("products_recommended"),
        notStated("objections"),
        notStated("customer_commitment_signals"),
        value("close_attempts", "shall I bill it", { earliestMs: 20_000 }),
        value("next_action", "call Saturday"),
        notStated("confirmed_business_outcome"),
      ],
    }),
  );
}

/** The visible structure of a rendered page, in document order. */
function structure(rendered: RenderResult): {
  headings: string[];
  labels: string[];
  tabs: string[];
  columns: string[];
} {
  const { container } = rendered;
  return {
    headings: [...container.querySelectorAll("h2")].map((node) => node.textContent?.trim() ?? ""),
    labels: [...container.querySelectorAll(".ip-label")].map(
      (node) => node.textContent?.trim() ?? "",
    ),
    tabs: [...container.querySelectorAll(".ip-tab")].map((node) => node.textContent?.trim() ?? ""),
    columns: [...container.querySelectorAll("thead th")].map(
      (node) => node.textContent?.trim() ?? "",
    ),
  };
}

function renderOverview(rows: PopulationRow[]) {
  return render(
    <OverviewView
      coverage={EMPTY_COVERAGE}
      coverageHref="/intelligence/overview?drawer=coverage"
      signals={overviewSignals(rows, null)}
      actions={overviewPriorityActions(rows)}
      actionHref={(key) => `/intelligence/overview?drawer=${key}`}
      numeratorHref={(key) => `/intelligence/overview?drawer=numerator:${key}`}
      pulse={overviewPulse(rows, null)}
      trend={null}
      trendMetrics={TREND_METRICS}
      trendMetricKey={TREND_METRICS[0]!.key}
      trendHref={(key) => `/intelligence/overview?signal=${key}`}
      breakdown={overviewBreakdown(
        rows,
        (item) => item.locationId,
        (key) => key,
      )}
      breakdownDimension="stores"
      breakdownHref={(dimension) => `/intelligence/overview?dimension=${dimension}`}
      breakdownRowHref={(key) => `/intelligence/overview?store=${key}`}
      breakdownCellHref={(key, metric) => `/intelligence/overview?store=${key}&drawer=${metric}`}
      usable={rows.length}
    />,
  );
}

function renderDemand(rows: PopulationRow[]) {
  return render(
    <DemandView
      metrics={computeDemand(rows)}
      previous={null}
      budget={budgetPicture(rows)}
      prices={contextPrices(rows)}
      clarity={clarityMatrix(rows)}
      origins={originStrip(rows)}
      categories={distribution(rows, (item) => item.purchaseCategory)}
      intents={distribution(rows, (item) => item.arrivalIntent)}
      needs={Object.fromEntries(
        NEED_TABS.map((tab) => [tab.key, rankedShare(rows, NEED_FIELD_KEYS[tab.key]!, 5)]),
      )}
      need="use_cases"
      needHref={(key) => `/intelligence/demand?need=${key}`}
      expandHref={null}
      voice={Object.fromEntries(VOICE_TABS.map((tab) => [tab.key, []]))}
      voiceTab="context"
      voiceHref={(key) => `/intelligence/demand?voice=${key}`}
      blockers={nonConversionReasons(rows)}
      categoryHref={(item) => `/intelligence/demand?category=${item}`}
      categoryExpandHref={null}
      intentHref={(item) => `/intelligence/demand?intent=${item}`}
      evidenceHref={(fieldKey, item) => `/intelligence/demand?drawer=value:${fieldKey}:${item}`}
    />,
  );
}

function renderJourney(rows: PopulationRow[]) {
  const cohort = selectCohort(rows, "all");
  const leakage = journeyLeakageCohorts(cohort);
  return render(
    <JourneyView
      cohortKey="all"
      cohortSizes={{
        high_intent: cohort.length,
        ready_to_buy: cohort.length,
        specific_product: 0,
        all: cohort.length,
      }}
      stages={journeyStages(cohort, leakage)}
      selectedStage="entered"
      stageHref={(key) => `/intelligence/journey?stage=${key}`}
      diagnosis={journeyDiagnosis(leakage)}
      lanes={interventions(cohort)}
      gaps={leakage}
      breakdown={journeyBreakdown(
        cohort,
        (item) => item.locationId,
        (key) => key,
      )}
      breakdownDimension="stores"
      breakdownHref={(next) => `/intelligence/journey?dimension=${next}`}
      outcomes={outcomeDistributions(cohort)}
      products={productPath(cohort)}
      cohortHref={(key) => `/intelligence/journey?cohort=${key}`}
      gapHref={(key) => `/intelligence/journey?drawer=${key}`}
      productHref={(fieldKey, item) => `/intelligence/journey?drawer=${fieldKey}:${item}`}
    />,
  );
}

function renderFrontline(rows: PopulationRow[]) {
  const compositions = responseCompositions(rows);
  return render(
    <FrontlineIntelligenceView
      metrics={computeFrontline(rows)}
      previousMetrics={null}
      actions={[null, null, null]}
      actionHref={(key) => `/intelligence/frontline?drawer=${key}`}
      stage="understand"
      stageHref={(key) => `/intelligence/frontline?stage=${key}`}
      detail={{
        questions: rankedShare(rows, ["customer_questions"], 6),
        questionComposition: questionResponseComposition(rows),
        recommended: rankedShare(rows, ["products_recommended"], 6),
        reasons: rankedShare(rows, ["recommendation_reasons"], 6),
        recommendationResponse: distribution(rows, () => null),
        objection: compositions.objection,
        finance: compositions.finance,
        offer: offerDetail(rows, 6),
        expand: expandDetail(rows, 6),
        commitment: rankedShare(rows, ["customer_commitment_signals"], 6),
        closes: rankedShare(rows, ["close_attempts"], 6),
        nextAction: nextActions(rows, 6),
      }}
      associations={outcomeAssociations(rows)}
      analysed={rows.length}
      withoutMetrics={null}
    />,
  );
}

describe("two materially different populations produce the same product", () => {
  const a = datasetA();
  const b = datasetB();

  it("gives Overview the same sections, signals, pulse, trend tabs and columns", () => {
    const first = structure(renderOverview(a));
    const second = structure(renderOverview(b));

    expect(first.headings).toEqual([
      "Coverage",
      "Core signals",
      "Priority actions",
      "Trend",
      "Breakdown",
    ]);
    expect(second.headings).toEqual(first.headings);
    expect(first.tabs).toEqual(second.tabs);
    expect(first.columns).toEqual(second.columns);
    // The four signals and six pulse figures, in position, whatever moved.
    expect(first.labels.slice(0, 10)).toEqual([
      "Recorded",
      "Transcribed",
      "Analysed",
      "Usable",
      "Outcome known",
      "Evidence ready",
      "Recording hours",
      "High-intent arrivals",
      "Clarity improved",
      "Preference formed",
    ]);
    expect(second.labels).toEqual(first.labels);
  });

  it("keeps the six trend tabs and their order, and the default selection", () => {
    expect(TREND_METRICS.map((metric) => metric.label)).toEqual([
      "High-intent arrivals",
      "Clarity improved",
      "Preference formed",
      "Close after commitment",
      "Competitor mentions",
      "Finance demand",
    ]);
    // The default is the first tab, never whichever metric moved most.
    const first = structure(renderOverview(a));
    expect(first.tabs[0]).toBe("High-intent arrivals");
  });

  it("gives Demand the same seven sections and tab order", () => {
    const first = structure(renderDemand(a));
    const second = structure(renderDemand(b));
    expect(first.headings).toEqual([
      "Demand mix",
      "Arrival intent",
      "Needs",
      "Budget",
      "Clarity",
      "Context & voice",
      "No-sale blockers",
    ]);
    expect(second.headings).toEqual(first.headings);
    expect(first.tabs).toEqual(second.tabs);
    expect(NEED_TABS.map((tab) => tab.label)).toEqual([
      "Initial request",
      "Use cases",
      "Requirements",
      "Decision drivers",
      "Brands",
    ]);
    expect(VOICE_TABS.map((tab) => tab.label)).toEqual([
      "Context",
      "Competitors",
      "Stock & offers",
      "Questions",
      "Objections",
      "Conditions",
    ]);
  });

  it("gives Journey the same sections, four nodes and five diagnosis rows", () => {
    const first = renderJourney(a);
    const second = renderJourney(b);
    expect(structure(first).headings).toEqual([
      "Decision path",
      "Business result",
      "Customer state",
      "Diagnosis",
      "Product path",
      "Breakdown",
    ]);
    expect(structure(second).headings).toEqual(structure(first).headings);
    for (const rendered of [first, second]) {
      expect(rendered.container.querySelectorAll(".ip-node")).toHaveLength(4);
      const diagnosisRows = [...rendered.container.querySelectorAll("#jr-diagnosis")][0]!
        .closest("section")!
        .querySelectorAll("tbody tr");
      expect(diagnosisRows).toHaveLength(5);
      expect([...diagnosisRows].map((node) => node.querySelector("th")?.textContent)).toEqual([
        "Requirement still unclear",
        "Clear requirement, no preferred product observed",
        "Preferred product, no commitment signal observed",
        "Commitment signal + confirmed no-sale",
        "Commitment signal + outcome unknown",
      ]);
    }
    expect(structure(first).columns).toEqual(structure(second).columns);
  });

  it("gives Frontline the same five stages and behaviour rows", () => {
    const first = renderFrontline(a);
    const second = renderFrontline(b);
    expect(STAGES.map((stage) => stage.label)).toEqual([
      "Understand",
      "Recommend",
      "Resolve",
      "Expand",
      "Close",
    ]);
    for (const rendered of [first, second]) {
      expect(rendered.container.querySelectorAll(".ip-stage")).toHaveLength(5);
    }
    expect(structure(first).headings).toEqual(structure(second).headings);
  });

  it("orders the behaviour comparison by registry, not by effect size", () => {
    const ordered = outcomeAssociations(datasetA()).rows.map((behaviour) => behaviour.label);
    expect(ordered).toEqual([
      "Recommendation incidence",
      "Recommendation rationale",
      "Demo where applicable",
      "Alternative where applicable",
      "Full objection response",
      "Finance response coverage",
      "Commercial offer",
      "Cross-sell",
      "Upsell",
      "Close after commitment",
      "Next action capture",
    ]);
    expect(outcomeAssociations(datasetB()).rows.map((behaviour) => behaviour.label)).toEqual(
      ordered,
    );
  });
});
