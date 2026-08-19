import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataState, stateFor } from "@/components/intelligence/data-state";
import { DemandView, NEED_TABS, VOICE_TABS } from "@/components/intelligence/demand-view";
import { IntelligenceFilterBar } from "@/components/intelligence/filter-bar";
import {
  FrontlineIntelligenceView,
  STAGES,
} from "@/components/intelligence/frontline-intelligence-view";
import { JourneyView } from "@/components/intelligence/journey-view";
import { OverviewView } from "@/components/intelligence/overview-view";
import { QuadrantBenchmark } from "@/components/intelligence/quadrant-benchmark";
import { valueCohort, valueCohortKey, resolveCohort } from "@/modules/intelligence/cohorts";
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
  FILTER_PARAM_KEYS,
  intelligenceHref,
  narrowByScope,
  parseFilters,
  type IntelligenceFilters,
} from "@/modules/intelligence/filters";
import {
  computeFrontline,
  expandDetail,
  nextActions,
  offerDetail,
  outcomeAssociations,
  questionResponseComposition,
  responseCompositions,
} from "@/modules/intelligence/frontline";
import {
  interventions,
  journeyBreakdown,
  journeyLeakageCohorts,
  journeyStages,
  outcomeDistributions,
  productPath,
  selectCohort,
} from "@/modules/intelligence/journey";
import { readOutcome } from "@/modules/intelligence/outcome";
import { overviewActions, overviewPulse, overviewSignals } from "@/modules/intelligence/overview";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";
import { quadrantSource } from "@/modules/intelligence/quadrant";

/**
 * The shipping contract for the four Intelligence pages.
 *
 * These are not tests of arithmetic — the metric modules have their own. They
 * assert the promises the product makes about its own shape: that a slot exists
 * whether or not it has data, that absence is never rendered as zero, that a
 * comparison drawn from four conversations is suppressed rather than styled, and
 * that nothing on the page invents a quadrant.
 */

const value = (
  fieldKey: string,
  valueText: string | null,
  label: string | null = null,
): PopulationValue => ({
  fieldKey,
  label,
  valueText,
  valueNumber: null,
  amountMinor: null,
  currency: "INR",
  abstention: null,
  hasEvidence: true,
  earliestMs: 0,
});

let seq = 0;
function row(overrides: Partial<PopulationRow> = {}): PopulationRow {
  const values = overrides.values ?? [];
  return {
    conversationId: `c${(seq += 1)}`,
    recordId: `r${seq}`,
    startedAt: "2026-08-01T10:00:00Z",
    locationId: "store-1",
    representativeMembershipId: null,
    teamId: null,
    purchaseCategory: "laptop",
    arrivalIntent: "ready_to_buy",
    clarityStart: 1,
    clarityEnd: 2,
    targetBudgetMinor: null,
    maxBudgetMinor: null,
    budgetCurrency: "INR",
    productsRecommendedCount: 0,
    objectionCount: 0,
    objectionCoverage: null,
    competitorCount: 0,
    financeRequested: false,
    demoPerformed: null,
    alternativeOffered: null,
    crossSellCount: 0,
    upsellCount: 0,
    customerQuestionCount: 0,
    ...overrides,
    values,
    outcome: readOutcome(values),
  };
}

const FILTERS: IntelligenceFilters = parseFilters({});

function renderOverview(rows: PopulationRow[]) {
  return render(
    <OverviewView
      signals={overviewSignals(rows, null)}
      actions={overviewActions(rows)}
      actionHref={(key) => `/intelligence/overview?drawer=${key}`}
      pulse={overviewPulse(rows, null)}
      trend={null}
      trendMetrics={[]}
      trendHref={(key) => `/intelligence/overview?signal=${key}`}
      hotspots={[]}
      hotspotLabel="Store"
      hotspotHref={() => null}
      analysed={rows.length}
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
      needs={rankedShare(rows, ["purchase_use_cases"], 5)}
      need="use_cases"
      needHref={(key) => `/intelligence/demand?need=${key}`}
      expandHref={null}
      voice={[
        {
          key: "language_mix",
          title: "Language",
          list: rankedShare(rows, ["language_mix"], 6),
          unit: "as spoken",
          controlled: false,
        },
      ]}
      voiceTab="context"
      voiceHref={(key) => `/intelligence/demand?voice=${key}`}
      blockers={nonConversionReasons(rows)}
      categoryHref={(value) =>
        intelligenceHref("/intelligence/demand", { ...FILTERS, category: value })
      }
      intentHref={(value) =>
        intelligenceHref("/intelligence/demand", { ...FILTERS, intent: value })
      }
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
      lanes={interventions(cohort)}
      gaps={leakage}
      breakdown={journeyBreakdown(
        cohort,
        (item) => item.locationId,
        (key) => key,
      )}
      breakdownLabel="Store"
      outcomes={outcomeDistributions(cohort)}
      products={productPath(cohort)}
      cohortHref={(key) => `/intelligence/journey?cohort=${key}`}
      gapHref={(key) => `/intelligence/journey?drawer=${key}`}
      productHref={(fieldKey, itemValue) =>
        `/intelligence/journey?drawer=${valueCohortKey(fieldKey, itemValue)}`
      }
    />,
  );
}

function renderFrontline(
  rows: PopulationRow[],
  stage: (typeof STAGES)[number]["key"] = "recommend",
) {
  const compositions = responseCompositions(rows);
  return render(
    <FrontlineIntelligenceView
      metrics={computeFrontline(rows)}
      previousMetrics={null}
      actions={[]}
      actionHref={(key) => `/intelligence/frontline?drawer=${key}`}
      stage={stage}
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
      quadrantTab="benchmark"
      quadrantHref={(key) => `/intelligence/frontline?q1=${key}`}
    />,
  );
}

describe("fixed slots survive empty data", () => {
  it("keeps every Overview slot when nothing was analysed", () => {
    renderOverview([]);
    for (const heading of ["Signals", "Actions", "Trend", "Hotspots"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    // All four signals, all six pulse figures, all three action slots.
    expect(screen.getByText("Arrived decided")).toBeInTheDocument();
    expect(screen.getByText("Close after commitment")).toBeInTheDocument();
    expect(screen.getByText("Next action capture")).toBeInTheDocument();
  });

  it("keeps every Demand section when nothing was analysed", () => {
    renderDemand([]);
    for (const heading of ["Demand mix", "Needs", "Budget", "Clarity", "No-sale blockers"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("never renders a missing measure as zero", () => {
    renderOverview([]);
    // An empty period must not produce a confident 0%.
    expect(screen.queryByText("0%")).toBeNull();
  });
});

describe("the five data states are distinct", () => {
  it("separates nothing-observed from not-supported from too-thin", () => {
    expect(stateFor(null)).toBe("NOT_SUPPORTED");
    expect(
      stateFor({
        value: null,
        eligible: 0,
        observed: 0,
        coverage: null,
        confidence: "insufficient",
      }),
    ).toBe("NO_OBSERVATIONS");
    expect(
      stateFor({ value: null, eligible: 12, observed: 0, coverage: 0, confidence: "insufficient" }),
    ).toBe("NOT_SUPPORTED");
    expect(
      stateFor(
        {
          value: 0.5,
          eligible: 4,
          observed: 4,
          affected: 2,
          coverage: 1,
          confidence: "insufficient",
        },
        { comparison: true },
      ),
    ).toBe("LOW_SAMPLE");
  });

  it("gives each state its own words", () => {
    const seen = new Set<string>();
    for (const state of ["NO_OBSERVATIONS", "NOT_SUPPORTED", "LOW_SAMPLE", "ERROR"] as const) {
      const { container, unmount } = render(<DataState state={state} />);
      const text = container.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
      expect(seen.has(text)).toBe(false);
      seen.add(text);
      unmount();
    }
  });

  it("never says zero when the read failed", () => {
    render(<DataState state="ERROR" />);
    expect(screen.getByText("Unable to load this analysis")).toBeInTheDocument();
  });
});

describe("clicking a visual applies a filter", () => {
  it("turns a category bar into a category filter", () => {
    renderDemand([row(), row({ purchaseCategory: "washing machine" })]);
    const link = screen.getByRole("link", { name: /laptop/i });
    expect(link.getAttribute("href")).toBe("/intelligence/demand?category=laptop");
  });

  it("turns an arrival-intent segment into an intent filter", () => {
    const { container } = renderDemand([row({ arrivalIntent: "ready_to_buy" })]);
    const segment = container.querySelector('a[href*="intent=ready_to_buy"]');
    expect(segment).not.toBeNull();
  });
});

describe("the selection travels", () => {
  const narrowed: IntelligenceFilters = parseFilters({
    days: "7",
    store: "s1",
    category: "laptop",
    rep: "m1",
    intent: "ready_to_buy",
    outcome: "no_sale",
    decision: "deferred",
    language: "Hindi",
  });

  it("carries every dimension into each of the four pages and the drill-down", () => {
    const query = intelligenceHref("", narrowed);
    for (const base of [
      "/intelligence/overview",
      "/intelligence/demand",
      "/intelligence/journey",
      "/intelligence/frontline",
      "/intelligence/cohort/no_commitment_signal",
    ]) {
      expect(intelligenceHref(base, narrowed)).toBe(`${base}${query}`);
    }
  });

  it("carries only the population filters between pages, never page-local state", () => {
    // `stage=close` on the Demand page is meaningless, and `drawer=` would open
    // a panel nobody asked for.
    expect([...FILTER_PARAM_KEYS]).toEqual([
      "days",
      "compare",
      "store",
      "category",
      "rep",
      "intent",
      "outcome",
      "decision",
      "language",
    ]);
    for (const local of ["need", "voice", "stage", "drawer", "cohort", "signal", "all", "q1"]) {
      expect(FILTER_PARAM_KEYS as readonly string[]).not.toContain(local);
    }
  });

  it("keeps page-local state when a filter changes", () => {
    expect(intelligenceHref("/intelligence/frontline", narrowed, { stage: "close" })).toContain(
      "stage=close",
    );
  });

  it("narrows rows by the interaction-level dimensions", () => {
    const rows = [
      row({ arrivalIntent: "ready_to_buy", values: [value("language_mix", "Hindi")] }),
      row({ arrivalIntent: "exploratory", values: [value("language_mix", "Hindi")] }),
      row({ arrivalIntent: "ready_to_buy", values: [value("language_mix", "Tamil")] }),
    ];
    expect(
      narrowByScope(rows, { ...FILTERS, intent: "ready_to_buy", language: "Hindi" }),
    ).toHaveLength(1);
  });

  it("returns nothing rather than widening when the combination matches nothing", () => {
    const rows = [row({ arrivalIntent: "exploratory" })];
    expect(narrowByScope(rows, { ...FILTERS, intent: "ready_to_buy" })).toHaveLength(0);
  });
});

describe("more than eight options stops being chips", () => {
  it("becomes a select the reader can search", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: `s${index}`,
      name: `Store ${index}`,
    }));
    render(
      <IntelligenceFilterBar
        basePath="/intelligence/overview"
        filters={FILTERS}
        stores={many}
        categories={[]}
        interactions={40}
        storeCount={12}
      />,
    );
    expect(screen.getByLabelText("Store").tagName).toBe("SELECT");
  });

  it("stays as chips while every option fits on a line", () => {
    render(
      <IntelligenceFilterBar
        basePath="/intelligence/overview"
        filters={FILTERS}
        stores={[
          { id: "a", name: "Andheri" },
          { id: "b", name: "Bandra" },
        ]}
        categories={[]}
        interactions={40}
        storeCount={2}
      />,
    );
    expect(screen.queryByLabelText("Store")).toBeNull();
    expect(screen.getByRole("link", { name: "Andheri" })).toBeInTheDocument();
  });

  it("states the scope it is measuring", () => {
    render(
      <IntelligenceFilterBar
        basePath="/intelligence/overview"
        filters={FILTERS}
        stores={[]}
        categories={[]}
        interactions={41}
        storeCount={3}
      />,
    );
    expect(screen.getByText(/41 interactions · 3 stores · Last 30 days/)).toBeInTheDocument();
  });
});

describe("the journey rail", () => {
  const rows = [
    row({ values: [value("final_preferred_product", "Acer Swift")] }),
    row({ values: [value("customer_commitment_signals", "will take it")] }),
    row({ clarityEnd: 1, values: [] }),
  ];

  it("has exactly four nodes and no bought node", () => {
    const { container } = renderJourney(rows);
    const nodes = container.querySelectorAll(".ip-node");
    expect(nodes).toHaveLength(4);
    expect(container.textContent).not.toMatch(/bought/i);
    expect([...nodes].map((node) => node.querySelector(".ip-label")?.textContent)).toEqual([
      "Cohort",
      "Requirement clear",
      "Preference formed",
      "Commitment signal",
    ]);
  });

  it("never calls a missing observation a failure", () => {
    const { container } = renderJourney(rows);
    const text = container.textContent ?? "";
    for (const forbidden of ["where it broke", "lost", "failed", "dropped"]) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("keeps the business result and the customer state as separate panels", () => {
    renderJourney(rows);
    expect(screen.getByRole("heading", { name: "Business result" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Customer state" })).toBeInTheDocument();
  });

  it("shows counts rather than a confident rate on a tiny comparison", () => {
    const thin = [
      row({ locationId: "store-1", values: [] }),
      row({ locationId: "store-2", values: [] }),
    ];
    const { container } = renderJourney(thin);
    const table = container.querySelector(".ip-table");
    expect(table).not.toBeNull();
    // A cell drawn from one or two interactions prints its raw counts, because
    // 0% and 100% read as a difference between stores that they cannot support.
    expect(within(table as HTMLElement).getAllByText(/^\d+\/\d+$/).length).toBeGreaterThan(0);
  });
});

describe("frontline execution", () => {
  it("always renders all five stages", () => {
    const { container } = renderFrontline([]);
    expect(container.querySelectorAll(".ip-stage")).toHaveLength(5);
    for (const stage of STAGES) {
      expect(screen.getByRole("heading", { name: stage.label })).toBeInTheDocument();
    }
  });

  it("shows the alternative rate in the recommend detail", () => {
    renderFrontline([row({ alternativeOffered: "yes" }), row({ alternativeOffered: "no" })]);
    expect(screen.getByText("Offered an alternative")).toBeInTheDocument();
  });

  it("never calls a missing finance status unanswered", () => {
    const rows = [row({ values: [value("customer_questions", "emi?", "finance")] })];
    const { container } = renderFrontline(rows, "resolve");
    expect(container.textContent).toContain("No response status recorded");
    expect(container.textContent).not.toMatch(/finance[^.]*unanswered/i);
  });

  it("suppresses the sale comparison until both groups clear the bar", () => {
    const rows = [
      row({ values: [value("confirmed_business_outcome", "sale")] }),
      ...Array.from({ length: 9 }, () =>
        row({ values: [value("confirmed_business_outcome", "no_sale")] }),
      ),
    ];
    const { container } = renderFrontline(rows);
    expect(container.querySelector(".ip-dumb")).toBeNull();
    expect(screen.getByText("Too few established outcomes to compare")).toBeInTheDocument();
  });
});

describe("the quadrant benchmark", () => {
  it("has no canonical source and says so", () => {
    expect(quadrantSource().connected).toBe(false);
  });

  it("renders the slot rather than hiding it", () => {
    render(<QuadrantBenchmark tab="benchmark" hrefFor={(key) => `?q1=${key}`} />);
    expect(screen.getByRole("heading", { name: "Learn from Q1" })).toBeInTheDocument();
    expect(screen.getByText("Quadrant benchmark not connected")).toBeInTheDocument();
  });

  it("shows no quadrant values while the source is missing", () => {
    const { container } = render(
      <QuadrantBenchmark tab="benchmark" hrefFor={(key) => `?q1=${key}`} />,
    );
    const cells = [...container.querySelectorAll("tbody td")].map((cell) => cell.textContent);
    expect(cells.every((cell) => cell === "—")).toBe(true);
  });
});

describe("a drill-down opens exactly what was counted", () => {
  it("resolves a value cohort to the interactions carrying that value", () => {
    const rows = [
      row({ values: [value("final_preferred_product", "Acer Swift")] }),
      row({ values: [value("final_preferred_product", "Dell 14")] }),
      row({ values: [value("final_preferred_product", "Acer Swift")] }),
    ];
    const cohort = valueCohort(rows, "final_preferred_product", "Acer Swift");
    expect(cohort.conversationIds).toHaveLength(2);
    expect(cohort.measurable).toBe(3);
    // The same key, read back out of a URL, resolves to the same set.
    expect(
      resolveCohort(rows, valueCohortKey("final_preferred_product", "Acer Swift"))?.conversationIds,
    ).toEqual(cohort.conversationIds);
  });

  it("cites the field the value came from, so the quote is checkable", () => {
    const cohort = valueCohort([row()], "final_preferred_product", "Acer Swift");
    expect(cohort.evidenceFieldKeys).toEqual(["final_preferred_product"]);
  });

  it("matches the count a gap advertises to the cohort behind it", () => {
    const rows = [
      row({ clarityEnd: 1, values: [] }),
      row({ clarityEnd: 1, values: [] }),
      row({ clarityEnd: 3, values: [] }),
    ];
    const leakage = journeyLeakageCohorts(rows);
    const stages = journeyStages(rows, leakage);
    const clarity = stages.find((stage) => stage.key === "requirement_clear")!;
    const behind = leakage.find((item) => item.key === clarity.gap!.cohortKey)!;
    expect(clarity.gap!.missing).toBe(behind.conversationIds.length);
  });
});

describe("the tab sets are the ones the contract fixes", () => {
  it("offers exactly the five Needs panels", () => {
    expect(NEED_TABS.map((tab) => tab.label)).toEqual([
      "Initial request",
      "Use cases",
      "Requirements",
      "Decision drivers",
      "Brands",
    ]);
  });

  it("offers exactly the six Context & voice panels", () => {
    expect(VOICE_TABS.map((tab) => tab.label)).toEqual([
      "Context",
      "Competitors",
      "Stock & offers",
      "Questions",
      "Objections",
      "Conditions",
    ]);
  });
});
