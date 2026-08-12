import { describe, expect, it } from "vitest";

import {
  classifyBuyingBehaviour,
  summarizeBehaviour,
  type BehaviourSignals,
} from "@/modules/interaction-metrics/buying-behaviour";
import {
  computeDecisionHierarchy,
  decisionDimensionFor,
  type DecisionAppearance,
} from "@/modules/interaction-metrics/decision-hierarchy";

/**
 * Both of these answer questions the category playbook says retailers cannot
 * currently answer, so the rules that produce them are pinned — especially the
 * abstentions, because a guessed classification is worse than a gap when the
 * whole point is to compare it against what the business believes.
 */

function appearance(
  conversationId: string,
  dimension: string,
  firstMilliseconds: number,
): DecisionAppearance {
  return { conversationId, dimension, firstMilliseconds };
}

describe("decision hierarchy", () => {
  it("maps requirement fields to the filter they speak to", () => {
    expect(decisionDimensionFor("target_budget")).toBe("budget");
    expect(decisionDimensionFor("maximum_budget")).toBe("budget");
    expect(decisionDimensionFor("brand_preferences")).toBe("brand");
    // Not a decision filter the customer applies.
    expect(decisionDimensionFor("objections")).toBeNull();
  });

  it("ranks filters by when they surface, earliest first", () => {
    const filters = computeDecisionHierarchy([
      appearance("c1", "budget", 5_000),
      appearance("c1", "use case", 1_000),
      appearance("c1", "brand", 9_000),
    ]);
    expect(filters.map((f) => f.dimension)).toEqual(["use case", "budget", "brand"]);
    expect(filters[0]!.firstShare).toBe(1);
  });

  it("takes the earliest mention when one dimension has several sources", () => {
    // Budget arrives via maximum_budget late and target_budget early; the
    // dimension entered the conversation at the earlier moment.
    const filters = computeDecisionHierarchy([
      appearance("c1", "budget", 8_000),
      appearance("c1", "budget", 2_000),
      appearance("c1", "use case", 5_000),
    ]);
    expect(filters.map((f) => f.dimension)).toEqual(["budget", "use case"]);
  });

  it("averages rank across conversations rather than pooling raw timestamps", () => {
    // Budget is first in one conversation and second in the other; use case the
    // reverse. Pooling timestamps would let a long conversation dominate.
    const filters = computeDecisionHierarchy([
      appearance("c1", "budget", 1_000),
      appearance("c1", "use case", 2_000),
      appearance("c2", "use case", 600_000),
      appearance("c2", "budget", 900_000),
    ]);
    for (const filter of filters) {
      expect(filter.conversations).toBe(2);
      expect(filter.meanRank).toBe(1.5);
      expect(filter.firstShare).toBe(0.5);
    }
  });

  it("returns nothing when no requirement was ever evidenced", () => {
    expect(computeDecisionHierarchy([])).toEqual([]);
  });
});

function signals(over: Partial<BehaviourSignals> = {}): BehaviourSignals {
  return {
    arrivalIntent: null,
    clarityStart: null,
    productsConsidered: 0,
    competitorsNamed: 0,
    ...over,
  };
}

describe("observed buying behaviour", () => {
  it("reads a customer who arrived for a named product as specialty", () => {
    expect(
      classifyBuyingBehaviour(signals({ arrivalIntent: "specific_product", clarityStart: 3 })),
    ).toBe("specialty");
  });

  it("reads comparison behaviour as shopping, however it shows up", () => {
    expect(classifyBuyingBehaviour(signals({ arrivalIntent: "comparing" }))).toBe("shopping");
    expect(
      classifyBuyingBehaviour(signals({ arrivalIntent: "ready_to_buy", productsConsidered: 3 })),
    ).toBe("shopping");
    expect(
      classifyBuyingBehaviour(signals({ arrivalIntent: "ready_to_buy", competitorsNamed: 1 })),
    ).toBe("shopping");
  });

  it("reads an undecided arrival with no formed need as unsought", () => {
    expect(
      classifyBuyingBehaviour(signals({ arrivalIntent: "exploratory", clarityStart: 0 })),
    ).toBe("unsought");
  });

  it("reads a decided, low-deliberation purchase as convenience", () => {
    expect(classifyBuyingBehaviour(signals({ arrivalIntent: "ready_to_buy" }))).toBe("convenience");
  });

  it("abstains when the conversation carries no signal at all", () => {
    expect(classifyBuyingBehaviour(signals())).toBeNull();
  });
});

describe("behaviour against the role the business set", () => {
  const shopping = Array.from({ length: 8 }, () => "shopping" as const);

  it("flags a dominant behaviour that contradicts the stated role", () => {
    const mix = summarizeBehaviour("laptop", shopping, "routine");
    expect(mix.dominant).toBe("shopping");
    expect(mix.mismatch).toBe(true);
  });

  it("does not flag a behaviour the role expects", () => {
    expect(summarizeBehaviour("laptop", shopping, "destination").mismatch).toBe(false);
  });

  it("never flags a mismatch on a thin sample", () => {
    // Three interactions cannot condemn a category's role.
    const mix = summarizeBehaviour("laptop", shopping.slice(0, 3), "routine");
    expect(mix.dominant).toBe("shopping");
    expect(mix.mismatch).toBe(false);
  });

  it("never flags a mismatch when no role has been stated", () => {
    const mix = summarizeBehaviour("laptop", shopping, null);
    expect(mix.intendedRole).toBeNull();
    expect(mix.mismatch).toBe(false);
  });

  it("withholds a dominant behaviour when opinion is split", () => {
    const mix = summarizeBehaviour(
      "laptop",
      ["shopping", "shopping", "specialty", "specialty", "convenience", "unsought"],
      "routine",
    );
    expect(mix.dominant).toBeNull();
    expect(mix.mismatch).toBe(false);
  });

  it("ignores abstained interactions in the denominator", () => {
    const mix = summarizeBehaviour("laptop", ["shopping", null, null], null);
    expect(mix.observed).toBe(1);
  });
});
