import { describe, expect, it } from "vitest";

import { resolveCohort } from "@/modules/intelligence/cohorts";
import {
  interventions,
  journeyBreakdown,
  journeyLeakageCohorts,
  journeyStages,
  selectCohort,
} from "@/modules/intelligence/journey";
import { readOutcome } from "@/modules/intelligence/outcome";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";

const value = (
  fieldKey: string,
  valueText: string | null,
  abstention: string | null = null,
): PopulationValue => ({
  fieldKey,
  label: null,
  valueText,
  valueNumber: null,
  amountMinor: null,
  currency: null,
  abstention,
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
    locationId: null,
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

/** A record that reached every state up to and including the one named. */
function through(state: "clear" | "preference" | "commitment" | "sale") {
  const values: PopulationValue[] = [value("final_preferred_product", null, "not_stated")];
  if (state !== "clear") values[0] = value("final_preferred_product", "Model A");
  values.push(
    state === "commitment" || state === "sale"
      ? value("customer_commitment_signals", "I'll take it")
      : value("customer_commitment_signals", null, "not_stated"),
  );
  values.push(value("confirmed_business_outcome", state === "sale" ? "sale" : "no_sale"));
  return row({ clarityEnd: 2, values });
}

describe("choosing who the journey is about", () => {
  it("treats arrived-decided as either specific product or ready to buy", () => {
    const rows = [
      row({ arrivalIntent: "ready_to_buy" }),
      row({ arrivalIntent: "specific_product" }),
      row({ arrivalIntent: "exploratory" }),
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
    expect(preference.lost).toBe(2);
  });

  it("does not count a record that predates a field as failing to reach a state", () => {
    // Nobody asked this record about a preferred product, so it leaves the
    // denominator rather than counting against the store.
    const stages = journeyStages([through("preference"), row({ clarityEnd: 2, values: [] })]);
    const preference = stages.find((stage) => stage.key === "preference_formed")!;
    expect(preference.reach.observed).toBe(1);
    expect(preference.reach.value).toBe(1);
  });

  it("reports no progression where nobody reached the state before", () => {
    // A percentage of zero people is not a small number, it is not a number.
    const stages = journeyStages([row({ clarityEnd: 0, values: [] })]);
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
      if (!stage.gapCohortKey) continue;
      expect(stage.lost, `${stage.key} gap disagrees with its cohort`).toBe(
        bySize.get(stage.gapCohortKey) ?? 0,
      );
    }
  });

  it("starts with the whole cohort at full reach", () => {
    const stages = journeyStages([through("clear"), through("clear")]);
    expect(stages[0]!.reach.value).toBe(1);
    expect(stages[0]!.progression).toBeNull();
    expect(stages[0]!.lost).toBe(0);
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
    const cohorts = journeyLeakageCohorts([
      through("commitment"),
      through("sale"),
      { ...through("commitment"), values: [], outcome: readOutcome([]) },
    ]);
    expect(
      cohorts.find((cohort) => cohort.key === "commitment_then_no_sale")?.conversationIds,
    ).toHaveLength(1);
    expect(cohorts.find((cohort) => cohort.key === "commitment_outcome_unknown")).toBeUndefined();
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
    const rows = [through("preference"), row({ productsRecommendedCount: 2, values: [] })];
    expect(resolveCohort(rows, "recommendation_without_rationale")).not.toBeNull();
    expect(resolveCohort(rows, "no_commitment_signal", "all")).not.toBeNull();
  });

  it("returns nothing for a key nobody defines", () => {
    expect(resolveCohort([through("clear")], "not_a_cohort")).toBeNull();
  });
});

describe("the frontline lane beside the journey", () => {
  it("measures each behaviour against the cohort, excluding unasked records", () => {
    const rates = interventions([
      row({ demoPerformed: "yes" }),
      row({ demoPerformed: "no" }),
      row({ values: [value("close_attempts", "shall I bill it")] }),
      row({ values: [] }),
    ]);
    expect(rates.find((rate) => rate.key === "demo")!.measure.value).toBe(0.25);
    expect(rates.find((rate) => rate.key === "close")!.measure.observed).toBe(1);
  });
});

describe("where the journey breaks by store", () => {
  it("groups and keeps each group's own size", () => {
    const rows = journeyBreakdown(
      [
        { ...through("sale"), locationId: "s1" },
        { ...through("clear"), locationId: "s1" },
        { ...through("clear"), locationId: "s2" },
      ],
      (r) => r.locationId,
      (key) => key,
    );
    expect(rows[0]).toMatchObject({ key: "s1", size: 2 });
    expect(rows[1]).toMatchObject({ key: "s2", size: 1 });
  });

  it("skips rows with nothing to group on", () => {
    expect(
      journeyBreakdown(
        [row({ locationId: null })],
        (r) => r.locationId,
        (k) => k,
      ),
    ).toHaveLength(0);
  });
});
