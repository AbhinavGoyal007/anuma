import { describe, expect, it } from "vitest";

import {
  cohortPath,
  decodeCohortKey,
  numeratorCohort,
  numeratorCohortKey,
  resolveCohort,
  valueCohort,
  valueCohortKey,
} from "@/modules/intelligence/cohorts";
import { NUMERATOR_COHORTS } from "@/modules/intelligence/measures";
import { CONCEPTS } from "@/modules/intelligence/concepts";
import { buildSeries, TREND_METRICS } from "@/modules/intelligence/trend";
import { notStated, row, unreadable, value } from "../support/population";

/**
 * Metric identity: the number, the cohort it opens, and the URL that carries it.
 *
 * The promise these tests hold the product to is that a displayed value, the
 * interactions behind it, and the address of those interactions are three views
 * of one thing. A tile that shows 18 and opens 14 is worse than a tile showing
 * nothing, because a reader checks it once and stops believing the page.
 */

const population = () => [
  row({
    values: [
      value("arrival_intent_state", "ready_to_buy"),
      value("finance_requested", "EMI"),
      value("requirement_clarity_start", "low"),
      value("requirement_clarity_end", "high"),
      value("competitor_named", "Croma"),
      value("confirmed_business_outcome", "sale"),
      value("next_action", "call Saturday"),
      value("customer_commitment_signals", "I'll take it", { earliestMs: 10_000 }),
      value("close_attempts", "shall I bill it", { earliestMs: 20_000 }),
    ],
  }),
  row({
    values: [
      value("arrival_intent_state", "exploratory"),
      notStated("finance_requested"),
      value("requirement_clarity_start", "low"),
      value("requirement_clarity_end", "low"),
      notStated("competitor_named"),
      notStated("confirmed_business_outcome"),
      notStated("next_action"),
      value("customer_commitment_signals", "I'll take it", { earliestMs: 30_000 }),
      notStated("close_attempts"),
    ],
  }),
  row({
    values: [
      unreadable("arrival_intent_state"),
      unreadable("finance_requested"),
      notStated("requirement_clarity_end"),
      value("competitor_named", "Reliance Digital"),
      value("confirmed_business_outcome", "no_sale"),
      value("next_action", "send quote"),
    ],
  }),
];

describe("a metric tile opens exactly what it counted", () => {
  it("matches every numerator cohort to its own measure", () => {
    const rows = population();
    for (const [key, definition] of Object.entries(NUMERATOR_COHORTS)) {
      const measured = definition.measure(rows);
      const cohort = numeratorCohort(rows, key)!;
      expect(cohort.conversationIds.length, `${key} cohort disagrees with its measure`).toBe(
        measured.affected ?? 0,
      );
      // And every interaction in the cohort really satisfies the predicate.
      const selected = new Set(definition.rows(rows).map((item) => item.conversationId));
      expect(new Set(cohort.conversationIds)).toEqual(selected);
    }
  });

  it("points a descriptive tile at its numerator, not at the failure beside it", () => {
    const rows = population();
    // Finance demand counts the interactions where finance was raised. It must
    // not open "asked about finance and got no recorded response", which is a
    // different set with a different size and a different meaning.
    const cohort = numeratorCohort(rows, "finance_demand")!;
    expect(cohort.conversationIds).toHaveLength(1);
    expect(cohort.key).toBe(numeratorCohortKey("finance_demand"));
    expect(cohort.reason).not.toMatch(/no response/i);
  });

  it("resolves a numerator key back to the same set through the drill-down door", () => {
    const rows = population();
    for (const key of Object.keys(NUMERATOR_COHORTS)) {
      expect(resolveCohort(rows, numeratorCohortKey(key))?.conversationIds).toEqual(
        numeratorCohort(rows, key)!.conversationIds,
      );
    }
  });

  it("reports the measurable population, so a count is never read as a share of everything", () => {
    const rows = population();
    const cohort = numeratorCohort(rows, "finance_demand")!;
    // Two interactions could be read either way; the third could not.
    expect(cohort.measurable).toBe(2);
  });
});

describe("cohort keys survive the URL", () => {
  const awkward = [
    "iPhone 15/Pro",
    "50% off",
    "A?B",
    "x#y",
    "label:value",
    "شاشة تلفزيون",
    "बैटरी लाइफ",
    "💡 lighting",
    "a b  c",
    "100%/50%",
  ];

  it("round-trips every awkward value through the route", () => {
    for (const raw of awkward) {
      const key = valueCohortKey("final_preferred_product", raw);
      const path = cohortPath(key);
      // Exactly one segment, with nothing in it a router could reinterpret.
      const segments = path.split("/");
      expect(segments, `${raw} split the route`).toHaveLength(4);
      expect(segments[3]).toMatch(/^[A-Za-z0-9_~-]+$/);
      expect(decodeCohortKey(segments[3]!), `round trip failed for ${raw}`).toBe(key);
    }
  });

  it("resolves the decoded key to the interactions carrying that exact value", () => {
    for (const raw of awkward) {
      const rows = [
        row({ values: [value("final_preferred_product", raw)] }),
        row({ values: [value("final_preferred_product", "something else")] }),
      ];
      const key = valueCohortKey("final_preferred_product", raw);
      const segment = cohortPath(key).split("/").pop()!;
      const cohort = resolveCohort(rows, decodeCohortKey(segment))!;
      expect(cohort.conversationIds, `resolve failed for ${raw}`).toHaveLength(1);
      expect(cohort.conversationIds).toEqual(
        valueCohort(rows, "final_preferred_product", raw).conversationIds,
      );
    }
  });

  it("leaves a plain key alone, so an older or hand-typed link still resolves", () => {
    expect(decodeCohortKey("objection_handling_gap")).toBe("objection_handling_gap");
  });

  it("splits a value cohort on the first colon only, so a value may contain one", () => {
    const rows = [row({ values: [value("next_action", "call: Saturday 4pm")] })];
    const cohort = resolveCohort(rows, valueCohortKey("next_action", "call: Saturday 4pm"))!;
    expect(cohort.conversationIds).toHaveLength(1);
  });
});

describe("a trend label describes its own predicate", () => {
  it("names every tracked metric after exactly what it matches", () => {
    // An earlier line read "Left without an established outcome" while matching
    // a much broader unresolved predicate that swept in customers who had
    // explicitly declined — a label that was a claim the data did not make. The
    // six now on the page each describe their own predicate.
    expect(TREND_METRICS.map((metric) => [metric.key, metric.label])).toEqual([
      ["high_intent_arrivals", "High-intent arrivals"],
      ["clarity_improved", "Clarity improved"],
      ["preference_formed", "Preference formed"],
      ["close_after_commitment", "Close after commitment"],
      ["competitor_mentions", "Competitor mentions"],
      ["finance_demand", "Finance demand"],
    ]);
  });

  it("counts a preference only where the requirement was clear enough to form one", () => {
    const status = CONCEPTS.preference_formed.status;
    const clearAndChosen = row({
      values: [
        value("requirement_clarity_end", "high"),
        value("final_preferred_product", "Acer Swift"),
      ],
    });
    const unclearButChosen = row({
      values: [
        value("requirement_clarity_end", "low"),
        value("final_preferred_product", "Acer Swift"),
      ],
    });
    expect(status(clearAndChosen)).toBe("yes");
    // Excluded from the denominator rather than counted as a miss.
    expect(status(unclearButChosen)).toBe("unsupported");
  });

  it("keeps an unreadable finance field out of the finance rate entirely", () => {
    const status = CONCEPTS.finance_demand.status;
    expect(status(row({ values: [value("finance_requested", "EMI")] }))).toBe("yes");
    expect(status(row({ values: [notStated("finance_requested")] }))).toBe("no");
    // Unusable is neither: it lowers coverage, never the rate.
    expect(status(row({ values: [unreadable("finance_requested")] }))).toBe("unusable");
  });

  it("leaves a period with too few interactions as a gap rather than a zero", () => {
    const metric = TREND_METRICS.find((entry) => entry.key === "finance_demand")!;
    const series = buildSeries(
      [row({ startedAt: "2026-08-17T10:00:00Z", values: [value("finance_requested", "EMI")] })],
      metric,
      7,
      new Date("2026-08-18T00:00:00Z"),
    );
    // One interaction cannot carry a rate; the bin is a hole, not a floor.
    expect(series.points.every((point) => point.value === null)).toBe(true);
    expect(series.points.some((point) => point.eligible > 0)).toBe(true);
  });
});
