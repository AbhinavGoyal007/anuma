import { describe, expect, it } from "vitest";

import { CONCEPTS, conceptMeasure, type ConceptKey } from "@/modules/intelligence/concepts";
import { NUMERATOR_COHORTS } from "@/modules/intelligence/measures";
import { overviewSignals } from "@/modules/intelligence/overview";
import type { PopulationRow } from "@/modules/intelligence/population";
import { buildSeries, TREND_METRICS } from "@/modules/intelligence/trend";

import { notStated, row, value } from "../support/population";

/**
 * One named question, one answer, wherever it is asked.
 *
 * The defect this file exists to catch is not a wrong number — it is two right
 * ones. When the Overview tile, the trend line and the drill-down each carry
 * their own copy of "close after commitment", they agree until one is edited,
 * and then a manager sees 41% on one page and 38% on another with no way to
 * tell which is true. Both stop being believed.
 */

/** A population spread across one day, so a single bin holds all of it. */
function population(): PopulationRow[] {
  const rows: PopulationRow[] = [];
  for (let index = 0; index < 32; index += 1) {
    const signalled = index % 2 === 0;
    rows.push(
      row({
        startedAt: "2026-08-19T10:00:00Z",
        values: [
          value("arrival_intent_state", index % 3 === 0 ? "ready_to_buy" : "browsing"),
          value("requirement_clarity_start", index % 2 === 0 ? "low" : "medium"),
          value("requirement_clarity_end", index % 4 === 0 ? "high" : "low"),
          value("specification_requirements", "waterproof"),
          index % 5 === 0
            ? notStated("final_preferred_product")
            : value("final_preferred_product", "Sofa A"),
          signalled
            ? value("customer_commitment_signals", "I will take it", { earliestMs: 60_000 })
            : notStated("customer_commitment_signals"),
          index % 3 === 0
            ? value("close_attempts", "shall I pack it", { earliestMs: 90_000 })
            : notStated("close_attempts"),
          index % 4 === 0
            ? value("competitor_named", "Other Store")
            : notStated("competitor_named"),
          index % 6 === 0
            ? value("finance_requested", "yes")
            : notStated("finance_requested"),
        ],
      }),
    );
  }
  return rows;
}

describe("a trend bin is the headline, binned", () => {
  const rows = population();

  for (const metric of TREND_METRICS) {
    it(`plots ${metric.key} from the same definition the tile shows`, () => {
      const aggregate = conceptMeasure(metric.key, rows);
      const series = buildSeries(rows, metric, 7, new Date("2026-08-20T00:00:00Z"));
      const day = series.points.find((point) => point.eligible > 0);
      expect(day, "the fixture must land in one bin").toBeDefined();
      expect(day!.eligible).toBe(aggregate.observed);
      expect(day!.matched).toBe(aggregate.affected ?? 0);
      // The bin plots the same rate, unless it is too thin to plot at all —
      // which is a guardrail, not a second definition.
      expect(day!.value).toBe(day!.thin ? null : aggregate.value);
    });
  }
});

describe("a tile opens the interactions it counted", () => {
  const rows = population();

  for (const [key, definition] of Object.entries(NUMERATOR_COHORTS)) {
    it(`matches ${key} to its own numerator`, () => {
      const measured = definition.measure(rows);
      expect(definition.rows(rows)).toHaveLength(measured.affected ?? 0);
    });
  }
});

describe("close after commitment", () => {
  const rows = population();

  it("says the same thing on the tile, in the trend and in the drill-down", () => {
    // The one concept with an ordering rule, so the one most likely to be
    // reimplemented slightly differently somewhere else.
    const key: ConceptKey = "close_after_commitment";
    const concept = conceptMeasure(key, rows);

    const signal = overviewSignals(rows, null).find((item) => item.key === key);
    expect(signal, "the Overview must carry this signal").toBeDefined();
    expect(signal!.measure).toEqual(concept);

    const metric = TREND_METRICS.find((item) => item.key === key)!;
    const series = buildSeries(rows, metric, 7, new Date("2026-08-20T00:00:00Z"));
    const day = series.points.find((point) => point.eligible > 0)!;
    expect(day.matched).toBe(concept.affected);

    const cohort = NUMERATOR_COHORTS[key]!;
    expect(cohort.rows(rows)).toHaveLength(concept.affected ?? 0);
    expect(cohort.measure(rows)).toEqual(concept);
  });

  it("counts a close before the signal as a no, and an unreadable one as neither", () => {
    const ordered = row({
      values: [
        value("customer_commitment_signals", "I will take it", { earliestMs: 60_000 }),
        value("close_attempts", "shall I pack it", { earliestMs: 90_000 }),
      ],
    });
    const reversed = row({
      values: [
        value("customer_commitment_signals", "I will take it", { earliestMs: 90_000 }),
        value("close_attempts", "shall I pack it", { earliestMs: 60_000 }),
      ],
    });
    const unreadable = row({
      values: [
        value("customer_commitment_signals", "I will take it", { earliestMs: 60_000 }),
        value("close_attempts", null, { abstention: "insufficient_evidence" }),
      ],
    });
    expect(CONCEPTS.close_after_commitment.status(ordered)).toBe("yes");
    expect(CONCEPTS.close_after_commitment.status(reversed)).toBe("no");
    // Not a representative who failed to close. A recording we could not read.
    expect(CONCEPTS.close_after_commitment.status(unreadable)).toBe("unusable");
  });
});
