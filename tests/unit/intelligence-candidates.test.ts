import { describe, expect, it } from "vitest";

import {
  changeCandidates,
  DEFAULT_THRESHOLDS,
  gapCandidates,
  rankCandidates,
  suppressionReason,
} from "@/modules/intelligence/candidates";
import type { DemandMetrics } from "@/modules/intelligence/demand";
import type { ActionCohort } from "@/modules/intelligence/frontline";
import { measure } from "@/modules/intelligence/guardrails";

function demand(overrides: Partial<DemandMetrics> = {}): DemandMetrics {
  const nothing = measure(0, 0, 0);
  return {
    analysed: 0,
    highIntent: nothing,
    financeDemand: nothing,
    competitorPressure: nothing,
    questionRate: nothing,
    purchaseConditions: nothing,
    outcomeClassified: nothing,
    preferenceFormed: nothing,
    ...overrides,
  };
}

const cohort = (key: string, count: number): ActionCohort => ({
  key,
  headline: "did something worth reviewing",
  reason: "Because of a thing",
  evidenceFieldKeys: ["objections"],
  conversationIds: Array.from({ length: count }, (_, index) => `c${key}${index}`),
});

describe("promoting a change", () => {
  it("stays silent when the previous period is too thin to compare", () => {
    // A confident current month against six conversations is not a trend, and
    // printing it as one teaches people to ignore the page.
    const candidates = changeCandidates(
      demand({ financeDemand: measure(30, 60, 60) }),
      demand({ financeDemand: measure(1, 6, 6) }),
    );
    expect(candidates).toHaveLength(0);
  });

  it("stays silent when the move is real but small", () => {
    const candidates = changeCandidates(
      demand({ financeDemand: measure(31, 100, 100) }),
      demand({ financeDemand: measure(29, 100, 100) }),
    );
    expect(candidates).toHaveLength(0);
  });

  it("promotes a material move on solid ground", () => {
    const [candidate] = changeCandidates(
      demand({ financeDemand: measure(40, 100, 100) }),
      demand({ financeDemand: measure(25, 100, 100) }),
    );
    expect(candidate?.id).toBe("change:finance_demand");
    expect(candidate?.deltaPoints).toBeCloseTo(15, 6);
    expect(candidate?.headline).toContain("40%");
    expect(candidate?.headline).toContain("25%");
  });

  it("describes direction without judging it", () => {
    // Whether customers ask about finance is not something the store controls,
    // so the page reports the movement and holds no opinion about it.
    const [rose] = changeCandidates(
      demand({ financeDemand: measure(40, 100, 100) }),
      demand({ financeDemand: measure(25, 100, 100) }),
    );
    const [fell] = changeCandidates(
      demand({ financeDemand: measure(25, 100, 100) }),
      demand({ financeDemand: measure(40, 100, 100) }),
    );
    expect(rose!.headline).toContain("More customers");
    expect(fell!.headline).toContain("Fewer customers");
    for (const word of ["worse", "better", "poor", "improved"]) {
      expect(rose!.headline.toLowerCase()).not.toContain(word);
      expect(fell!.headline.toLowerCase()).not.toContain(word);
    }
  });

  it("returns nothing when there is no previous period at all", () => {
    expect(changeCandidates(demand({ financeDemand: measure(40, 100, 100) }), null)).toHaveLength(
      0,
    );
  });
});

describe("promoting a gap", () => {
  it("ignores a gap too small to be worth a morning", () => {
    expect(gapCandidates([cohort("a", 2)], "")).toHaveLength(0);
  });

  it("marks a gap high priority once enough interactions are involved", () => {
    const [small] = gapCandidates([cohort("a", DEFAULT_THRESHOLDS.materialAffected)], "");
    const [large] = gapCandidates([cohort("b", DEFAULT_THRESHOLDS.urgentAffected)], "");
    expect(small!.priority).toBe("medium");
    expect(large!.priority).toBe("high");
  });

  it("carries the filters into the drill-down link", () => {
    const [candidate] = gapCandidates([cohort("a", 12)], "?days=90&store=s1");
    expect(candidate!.href).toBe("/intelligence/cohort/a?days=90&store=s1");
  });
});

describe("ordering the shortlist", () => {
  it("puts gaps with named interactions above movements", () => {
    // A movement is worth reading. Only a gap with conversations behind it is
    // something to do this week.
    const ranked = rankCandidates([
      ...changeCandidates(
        demand({ financeDemand: measure(40, 100, 100) }),
        demand({ financeDemand: measure(25, 100, 100) }),
      ),
      ...gapCandidates([cohort("a", 20)], ""),
    ]);
    expect(ranked[0]!.kind).toBe("gap");
  });

  it("breaks a tie on how many interactions are affected", () => {
    const ranked = rankCandidates(gapCandidates([cohort("a", 11), cohort("b", 30)], ""));
    expect(ranked[0]!.affected).toBe(30);
  });
});

describe("saying why nothing was promoted", () => {
  it("names the previous period when that is the reason", () => {
    const reason = suppressionReason(58, 2);
    expect(reason).toContain("2 interactions");
    expect(reason).toContain("10");
  });

  it("says so when comparison is switched off", () => {
    expect(suppressionReason(58, null)).toContain("switched off");
  });

  it("says nothing when both periods are solid", () => {
    expect(suppressionReason(120, 110)).toBeNull();
  });

  it("says nothing at all when there is no data to explain", () => {
    expect(suppressionReason(0, 0)).toBeNull();
  });
});
