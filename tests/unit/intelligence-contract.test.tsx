import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataState, stateFor } from "@/components/intelligence/data-state";
import {
  DemandView,
  NEED_FIELD_KEYS,
  NEED_TABS,
  VOICE_TABS,
} from "@/components/intelligence/demand-view";
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
  journeyDiagnosis,
  journeyLeakageCohorts,
  journeyStages,
  outcomeDistributions,
  productPath,
  selectCohort,
} from "@/modules/intelligence/journey";
import { measure } from "@/modules/intelligence/guardrails";
import { readOutcome } from "@/modules/intelligence/outcome";
import {
  overviewBreakdown,
  overviewPriorityActions,
  overviewPulse,
  overviewSignals,
} from "@/modules/intelligence/overview";
import type { PopulationRow } from "@/modules/intelligence/population";
import { notStated, row, value } from "../support/population";
import { quadrantSource } from "@/modules/intelligence/quadrant";
import { TREND_METRICS } from "@/modules/intelligence/trend";

/**
 * The shipping contract for the four Intelligence pages.
 *
 * These are not tests of arithmetic — the metric modules have their own. They
 * assert the promises the product makes about its own shape: that a slot exists
 * whether or not it has data, that absence is never rendered as zero, that a
 * comparison drawn from four conversations is suppressed rather than styled, and
 * that nothing on the page invents a quadrant.
 */

const FILTERS: IntelligenceFilters = parseFilters({});

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
  outcomeFieldAvailable: 0,
  evidenceReady: measure(0, 0, 0),
  usableConversationIds: [],
  currentRecordIdByConversation: new Map<string, string>(),
};

function renderOverview(rows: PopulationRow[]) {
  return render(
    <OverviewView
      coverage={EMPTY_COVERAGE}
      coverageHref="/intelligence/overview?drawer=coverage"
      analyticalFiltersActive={false}
      signals={overviewSignals(rows, null)}
      actions={overviewPriorityActions(rows)}
      actionHref={(key) => `/intelligence/overview?drawer=${key}`}
      numeratorHref={(key) => `/intelligence/overview?drawer=numerator:${key}`}
      pulse={overviewPulse(rows, null)}
      trend={null}
      trendMetrics={TREND_METRICS}
      trendMetricKey={TREND_METRICS[0]!.key}
      trendHref={(key) => `/intelligence/overview?signal=${key}`}
      breakdowns={{
        stores: overviewBreakdown(
          rows,
          (item) => item.locationId,
          (key) => key,
        ),
        categories: overviewBreakdown(
          rows,
          (item) => item.purchaseCategory,
          (key) => key,
        ),
      }}
      breakdownDimension="stores"
      breakdownHref={(dimension) => `/intelligence/overview?dimension=${dimension}`}
      breakdownRowHref={(which, key) => `/intelligence/overview?${which}=${key}`}
      breakdownCellHref={(which, key, metric) =>
        `/intelligence/overview?${which}=${key}&drawer=${metric}`
      }
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
      categories={distribution(rows, (item) => item.purchaseCategory, "purchase_category")}
      intents={distribution(rows, (item) => item.arrivalIntent, "arrival_intent_state")}
      needs={Object.fromEntries(
        NEED_TABS.map((tab) => [tab.key, rankedShare(rows, NEED_FIELD_KEYS[tab.key]!, 5)]),
      )}
      need="use_cases"
      needHref={(key) => `/intelligence/demand?need=${key}`}
      expandHref={null}
      voice={Object.fromEntries(
        VOICE_TABS.map((tab) => [
          tab.key,
          [
            {
              key: "language_mix",
              title: "Language",
              list: rankedShare(rows, ["language_mix"], 6),
              unit: "as spoken",
              controlled: false,
              fieldKey: "language_mix",
            },
          ],
        ]),
      )}
      voiceTab="context"
      voiceHref={(key) => `/intelligence/demand?voice=${key}`}
      blockers={nonConversionReasons(rows)}
      categoryHref={(value) =>
        intelligenceHref("/intelligence/demand", { ...FILTERS, category: value })
      }
      intentHref={(value) =>
        intelligenceHref("/intelligence/demand", { ...FILTERS, intent: value })
      }
      evidenceHref={(cohortKey) => `/intelligence/demand?drawer=${cohortKey}`}
    />,
  );
}

function renderJourney(rows: PopulationRow[]) {
  const cohort = selectCohort(rows, "all");
  const leakage = journeyLeakageCohorts(cohort);
  const stages = journeyStages(cohort, leakage);
  return render(
    <JourneyView
      cohortKey="all"
      cohortSizes={{
        high_intent: cohort.length,
        ready_to_buy: cohort.length,
        specific_product: 0,
        all: cohort.length,
      }}
      stages={stages}
      diagnosis={journeyDiagnosis(leakage)}
      lanes={interventions(cohort)}
      gaps={leakage}
      breakdowns={{
        stores: journeyBreakdown(
          cohort,
          (item) => item.locationId,
          (key) => key,
        ),
        categories: journeyBreakdown(
          cohort,
          (item) => item.purchaseCategory,
          (key) => key,
        ),
      }}
      breakdownDimension="stores"
      breakdownHref={(next) => `/intelligence/journey?dimension=${next}`}
      outcomes={outcomeDistributions(cohort)}
      outcomeHref={(axis, key) =>
        axis === "business"
          ? key === "sale" || key === "no_sale"
            ? `/intelligence/journey?outcome=${key}`
            : null
          : `/intelligence/journey?decision=${key}`
      }
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
    />,
  );
}

describe("fixed slots survive empty data", () => {
  it("keeps every Overview slot when nothing was analysed", () => {
    renderOverview([]);
    for (const heading of ["Coverage", "Core signals", "Priority actions", "Trend", "Breakdown"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    // All four signals and all six pulse figures, whatever the data holds.
    for (const label of [
      "High-intent arrivals",
      "Clarity improved",
      "Preference formed",
      "Close after commitment",
      "Median target budget",
      "Finance demand",
      "Competitor mentions",
      "Recommendation incidence",
      "Objection incidence",
      "Next action capture",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
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
    ).toBe("NOT_SUPPORTED");
    // Recorded, but in a form that settles nothing — not the same as absent.
    expect(
      stateFor({ value: null, eligible: 12, observed: 0, coverage: 0, confidence: "insufficient" }),
    ).toBe("NO_USABLE_OBSERVATIONS");
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
    for (const state of [
      "NO_OBSERVATIONS",
      "NO_USABLE_OBSERVATIONS",
      "NOT_SUPPORTED",
      "LOW_SAMPLE",
      "ERROR",
    ] as const) {
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
    renderDemand([
      row({ values: [value("purchase_category", "laptop")] }),
      row({ values: [value("purchase_category", "washing machine")] }),
    ]);
    // The bar narrows the page; the small Review beside it opens evidence.
    // One click must never do both jobs.
    const links = screen
      .getAllByRole("link", { name: /laptop/i })
      .map((link) => link.getAttribute("href") ?? "");
    expect(links).toContain("/intelligence/demand?category=laptop");
    expect(links.some((href) => href.includes("drawer=value:purchase_category:laptop"))).toBe(true);
  });

  it("turns an arrival-intent segment into an intent filter", () => {
    const { container } = renderDemand([
      row({ values: [value("arrival_intent_state", "ready_to_buy")] }),
    ]);
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
      row({
        values: [value("arrival_intent_state", "ready_to_buy"), value("language_mix", "Hindi")],
      }),
      row({
        values: [value("arrival_intent_state", "exploratory"), value("language_mix", "Hindi")],
      }),
      row({
        values: [value("arrival_intent_state", "ready_to_buy"), value("language_mix", "Tamil")],
      }),
    ];
    expect(
      narrowByScope(rows, { ...FILTERS, intent: "ready_to_buy", language: "Hindi" }),
    ).toHaveLength(1);
  });

  it("returns nothing rather than widening when the combination matches nothing", () => {
    const rows = [row({ values: [value("arrival_intent_state", "exploratory")] })];
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
        coverage={EMPTY_COVERAGE}
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
        coverage={EMPTY_COVERAGE}
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
        coverage={EMPTY_COVERAGE}
      />,
    );
    expect(
      screen.getByText(/41 usable interactions · 3 stores · Last 30 days/),
    ).toBeInTheDocument();
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

  it("narrows the page from a segment only where a filter is exactly that segment", () => {
    const decided = [
      row({ values: [value("confirmed_business_outcome", "sale")] }),
      row({ values: [notStated("confirmed_business_outcome")] }),
    ];
    const { container } = renderJourney(decided);
    const business = container.querySelector("#jr-business")!.closest("section")!;

    // A sale is `outcome=sale`, exactly.
    expect(business.querySelector('a[href*="outcome=sale"]')).toBeInTheDocument();
    // "Unconfirmed" is left plain: an approximate filter would show a different
    // count than the segment the reader just clicked.
    const links = [...business.querySelectorAll("a.ip-seg")].map((node) =>
      node.getAttribute("href"),
    );
    expect(links.some((href) => href?.includes("outcome=unknown"))).toBe(false);
  });

  it("shows counts rather than a confident rate on a tiny comparison", () => {
    const clarity = [
      value("requirement_clarity_start", "low"),
      value("requirement_clarity_end", "high"),
    ];
    const thin = [
      row({ locationId: "store-1", values: clarity }),
      row({ locationId: "store-2", values: clarity }),
    ];
    const { container } = renderJourney(thin);
    // The breakdown, not the diagnosis table above it.
    const table = container
      .querySelector("#jr-breakdown")
      ?.closest("section")
      ?.querySelector(".ip-table");
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
    renderFrontline([
      row({ values: [value("alternative_offered", "yes")] }),
      row({ values: [value("alternative_offered", "no")] }),
    ]);
    expect(screen.getByText("Offered an alternative")).toBeInTheDocument();
  });

  it("never calls a missing finance status unanswered", () => {
    const rows = [row({ values: [value("customer_questions", "emi?", { label: "finance" })] })];
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

describe("the copy contract", () => {
  it("never describes a customer's condition as what would close the sale", () => {
    // The field records the customer's own requirement for going ahead. The
    // other phrasing turns it into our sales opportunity, which is a different
    // claim about a person who has not agreed to anything.
    const surfaces = [
      "src/app/(app)/intelligence/demand/page.tsx",
      "src/components/intelligence/demand-view.tsx",
      "src/modules/intelligence/metric-registry.ts",
    ];
    for (const file of surfaces) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const rendered = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      expect(rendered.toLowerCase(), `${file} still says it`).not.toContain("would close it");
    }
  });
});

describe("a filter that cannot be honoured is never widened", () => {
  const FILTER_BAR = {
    basePath: "/intelligence/overview",
    stores: [{ id: "store-1", name: "Koramangala" }],
    categories: ["laptop", "sofas"],
    representatives: [],
    intents: [],
    languages: [],
    interactions: 0,
    storeCount: 1,
    coverage: EMPTY_COVERAGE,
  };

  it("says a stale, deleted or unauthorized store is unavailable and shows nothing", () => {
    render(
      <IntelligenceFilterBar
        {...FILTER_BAR}
        filters={{ ...FILTERS, storeId: "00000000-0000-0000-0000-000000000000" }}
        storeUnavailable
      />,
    );
    expect(screen.getByText("Selected store is unavailable in your scope.")).toBeInTheDocument();
    // Narrowed to nothing, and saying so — never "all stores".
    expect(screen.getByText(/0 usable interactions/)).toBeInTheDocument();
    expect(screen.getByText(/· 1 store ·/)).toBeInTheDocument();
    // The store id is not echoed back: printing it would be the disclosure the
    // filter was there to prevent.
    expect(screen.queryByText(/00000000/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reset" })).toBeInTheDocument();
  });

  it("keeps a salesperson it cannot name, and says the filter is applied", () => {
    // Zero usable interactions is a valid answer about a real person, not an
    // invalid selection to be cleared.
    render(
      <IntelligenceFilterBar
        {...FILTER_BAR}
        filters={{ ...FILTERS, representativeMembershipId: "m-unknown" }}
        representativeUnnamed
      />,
    );
    expect(screen.getByText(/salesperson whose name is unavailable/)).toBeInTheDocument();
    // The closed control describes what the page is actually showing. It used
    // to read "All salespeople" while the page showed one person's work.
    const control = document.querySelector("summary.ip-filter--active");
    expect(control).not.toBeNull();
    expect(control!.textContent).toBe("Selected salesperson");
    // Clearing the filter is still offered inside, and still labelled honestly.
    expect(screen.getByRole("link", { name: "All salespeople" })).toBeInTheDocument();
  });

  it("names a directory failure rather than showing an organization of one", () => {
    render(
      <IntelligenceFilterBar
        {...FILTER_BAR}
        filters={{ ...FILTERS, representativeMembershipId: "m-unknown" }}
        representativeUnnamed
        directoryError="permission denied"
      />,
    );
    expect(screen.getByText(/directory could not be read/)).toBeInTheDocument();
    expect(screen.getByText(/Any selected salesperson is still applied/)).toBeInTheDocument();
  });
});
