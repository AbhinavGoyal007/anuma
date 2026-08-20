import { describe, expect, it } from "vitest";

import { resolveCohort } from "@/modules/intelligence/cohorts";
import {
  interventions,
  journeyBreakdown,
  journeyLeakageCohorts,
  journeyStages,
  outcomeDistributions,
  selectCohort,
} from "@/modules/intelligence/journey";
import { notStated, row, value } from "../support/population";

/** An interaction that reached a given point on the rail, and no further. */
type Reached = "clear" | "preference" | "commitment" | "sale";

const ORDER: Reached[] = ["clear", "preference", "commitment", "sale"];

function through(reached: Reached, extra: { locationId?: string | null } = {}) {
  const depth = ORDER.indexOf(reached);
  const values = [
    value("requirement_clarity_start", "low"),
    value("requirement_clarity_end", "medium"),
    depth >= 1
      ? value("final_preferred_product", "Acer Swift")
      : notStated("final_preferred_product"),
    depth >= 2
      ? value("customer_commitment_signals", "I'll take it")
      : notStated("customer_commitment_signals"),
    ...(depth >= 3 ? [value("confirmed_business_outcome", "sale")] : []),
  ];
  return row({ ...extra, values });
}

/** A record analysed before the later fields existed. */
const clarityOnly = (level: "none" | "low" | "medium" | "high") =>
  row({
    values: [value("requirement_clarity_start", "low"), value("requirement_clarity_end", level)],
  });

describe("choosing who the journey is about", () => {
  it("treats arrived-decided as either specific product or ready to buy", () => {
    const rows = [
      row({ values: [value("arrival_intent_state", "ready_to_buy")] }),
      row({ values: [value("arrival_intent_state", "specific_product")] }),
      row({ values: [value("arrival_intent_state", "exploratory")] }),
    ];
    expect(selectCohort(rows, "high_intent")).toHaveLength(2);
    expect(selectCohort(rows, "ready_to_buy")).toHaveLength(1);
    expect(selectCohort(rows, "all")).toHaveLength(3);
  });
});

describe("how far the cohort got", () => {
  it("reports reach against the cohort and progression against the state before", () => {
    // Four reach "knew what they needed", two of those settle on a product. The
    // reach is 2 of 4; the progression is 2 of the 4 who got that far. A stage
    // can look thin only because the stage before it was, and progression is
    // what separates those two readings.
    const stages = journeyStages([
      through("preference"),
      through("preference"),
      through("clear"),
      through("clear"),
    ]);
    const preference = stages.find((stage) => stage.key === "preference_formed")!;
    expect(preference.reached).toBe(2);
    expect(preference.reach.value).toBe(0.5);
    expect(preference.progression!.value).toBe(0.5);
    expect(preference.gap!.missing).toBe(2);
  });

  it("does not count a record that predates a field as failing to reach a state", () => {
    // Nobody asked this record about a preferred product, so it leaves the
    // denominator rather than counting against the store.
    const stages = journeyStages([through("preference"), clarityOnly("medium")]);
    const preference = stages.find((stage) => stage.key === "preference_formed")!;
    expect(preference.reach.observed).toBe(1);
    expect(preference.reach.value).toBe(1);
  });

  it("reports no progression where nobody reached the state before", () => {
    // A percentage of zero people is not a small number, it is not a number.
    const stages = journeyStages([clarityOnly("none")]);
    expect(stages.find((stage) => stage.key === "preference_formed")!.progression).toBeNull();
  });

  it("sizes every gap by the group its link opens", () => {
    // The rail once said eighteen stopped before a sale while the link opened
    // fourteen. A count that disagrees with the list behind it is worse than no
    // count: a reader checks it once and stops trusting the page.
    const cohort = [
      through("preference"),
      through("preference"),
      through("commitment"),
      through("sale"),
    ];
    const leakage = journeyLeakageCohorts(cohort);
    const bySize = new Map(leakage.map((item) => [item.key, item.conversationIds.length]));
    for (const stage of journeyStages(cohort, leakage)) {
      if (!stage.gap) continue;
      expect(stage.gap.missing, `${stage.key} gap disagrees with its cohort`).toBe(
        bySize.get(stage.gap.cohortKey) ?? 0,
      );
      // The two lines the rail prints have to be complementary, or a reader is
      // handed two numbers that cannot both be true.
      expect(stage.gap.observed + stage.gap.missing).toBe(stage.gap.measurable);
    }
  });

  it("starts with the whole cohort at full reach", () => {
    const stages = journeyStages([through("clear"), through("clear")]);
    expect(stages[0]!.reach.value).toBe(1);
    expect(stages[0]!.progression).toBeNull();
    expect(stages[0]!.gap).toBeNull();
  });
});

describe("where the journey broke", () => {
  it("finds customers who settled on a product and never signalled", () => {
    const cohorts = journeyLeakageCohorts([through("preference"), through("commitment")]);
    expect(
      cohorts.find((cohort) => cohort.key === "no_commitment_signal")?.conversationIds,
    ).toHaveLength(1);
  });

  it("separates a confirmed no-sale from an outcome nobody established", () => {
    // These look identical in a filter and mean opposite things: one is a sale
    // to chase, the other is a hole in our own record.
    const signalled = (outcome: string | null) =>
      row({
        values: [
          value("customer_commitment_signals", "I'll take it"),
          ...(outcome ? [value("confirmed_business_outcome", outcome)] : []),
        ],
      });
    const cohorts = journeyLeakageCohorts([
      signalled("no_sale"),
      signalled("sale"),
      signalled(null),
    ]);
    expect(
      cohorts.find((cohort) => cohort.key === "commitment_then_no_sale")?.conversationIds,
    ).toHaveLength(1);
    expect(
      cohorts.find((cohort) => cohort.key === "commitment_outcome_unknown")?.conversationIds,
    ).toHaveLength(1);
  });

  it("cites something that was said, never an absence", () => {
    // There is no transcript line for a signal nobody gave, so every cohort
    // points at the thing that was present instead.
    for (const cohort of journeyLeakageCohorts([through("preference"), through("commitment")])) {
      expect(cohort.evidenceFieldKeys.length).toBeGreaterThan(0);
    }
  });

  it("orders by how many interactions are affected", () => {
    const cohorts = journeyLeakageCohorts([
      through("preference"),
      through("preference"),
      through("commitment"),
    ]);
    expect(cohorts[0]!.conversationIds.length).toBeGreaterThanOrEqual(
      cohorts[cohorts.length - 1]!.conversationIds.length,
    );
  });
});

describe("resolving a cohort for the drill-down", () => {
  it("finds a frontline cohort and a journey cohort through one door", () => {
    const rows = [
      through("preference"),
      row({ values: [value("products_recommended", "Dell 14")] }),
    ];
    expect(resolveCohort(rows, "recommendation_without_rationale")).not.toBeNull();
    expect(resolveCohort(rows, "no_commitment_signal", "all")).not.toBeNull();
  });

  it("returns nothing for a key nobody defines", () => {
    expect(resolveCohort([through("clear")], "not_a_cohort")).toBeNull();
  });
});

describe("the frontline lane beside the journey", () => {
  it("measures each behaviour on the population that could answer it", () => {
    // Two records answered the demo question, one of them yes. The two that
    // were never asked are not misses — counting them as such made the same
    // behaviour read 25% here and 50% on Frontline, which is how a reader
    // decides the dashboard cannot be trusted.
    const rates = interventions([
      row({ values: [value("product_demo_performed", "yes")] }),
      row({ values: [value("product_demo_performed", "no")] }),
      row({ values: [value("close_attempts", "shall I bill it")] }),
      row({ values: [] }),
    ]);
    const demo = rates.find((rate) => rate.key === "demo")!.measure;
    expect(demo.value).toBe(0.5);
    expect(demo.observed).toBe(2);
    expect(demo.eligible).toBe(2);
    expect(rates.find((rate) => rate.key === "close")!.measure.observed).toBe(1);
  });
});

describe("where the journey breaks by store", () => {
  it("groups and keeps each group's own size", () => {
    const rows = journeyBreakdown(
      [
        through("sale", { locationId: "s1" }),
        through("clear", { locationId: "s1" }),
        through("clear", { locationId: "s2" }),
      ],
      (item) => item.locationId,
      (key) => key,
    );
    expect(rows[0]).toMatchObject({ key: "s1", size: 2 });
    expect(rows[1]).toMatchObject({ key: "s2", size: 1 });
  });

  it("skips rows with nothing to group on", () => {
    expect(
      journeyBreakdown(
        [row({ locationId: null, values: [] })],
        (item) => item.locationId,
        (key) => key,
      ),
    ).toHaveLength(0);
  });
});

describe("the two outcome axes account for everyone", () => {
  it("sums each distribution to the cohort, so nobody is quietly dropped", () => {
    // A slice that does not add up is a slice somebody has been filed out of,
    // and the reader has no way to notice.
    const cohort = [
      row({
        values: [
          value("confirmed_business_outcome", "sale"),
          value("final_decision_state", "purchased"),
        ],
      }),
      row({
        values: [
          value("confirmed_business_outcome", "no_sale"),
          value("final_decision_state", "rejected"),
        ],
      }),
      row({ values: [value("final_decision_state", "follow_up_scheduled")] }),
      row({ values: [notStated("confirmed_business_outcome")] }),
    ];
    const { business, decision } = outcomeDistributions(cohort);
    const total = (slices: { count: number }[]) =>
      slices.reduce((sum, slice) => sum + slice.count, 0);
    expect(total(business)).toBe(cohort.length);
    expect(total(decision)).toBe(cohort.length);
  });

  it("never files an unestablished outcome under no sale", () => {
    const { business } = outcomeDistributions([row({ values: [] })]);
    expect(business.find((slice) => slice.key === "no_sale")!.count).toBe(0);
    expect(business.find((slice) => slice.key === "unknown")!.count).toBe(1);
  });
});
