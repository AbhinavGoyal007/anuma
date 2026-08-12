import { describe, expect, it } from "vitest";

import { computeDemandLeakage, type LeakageInput } from "@/modules/interaction-metrics/leakage";

/**
 * The funnel is the executive view a category head acts on, so the rules that
 * attribute a lost interaction to a stage are pinned here. The property that
 * matters most is that the stages are mutually exclusive and sum to the total —
 * a funnel whose numbers do not add up is worse than no funnel.
 */

function input(over: Partial<LeakageInput> = {}): LeakageInput {
  // A clean interaction that clears every gate without converting.
  return {
    purchased: false,
    hasIntentSignal: true,
    clarityEnd: 3,
    stockUnavailable: false,
    priceOrFinanceBlocked: false,
    recommendationMade: true,
    frictionUnaddressed: false,
    ...over,
  };
}

function leakedAt(result: ReturnType<typeof computeDemandLeakage>, key: string): number {
  return result.stages.find((stage) => stage.key === key)?.leaked ?? 0;
}

describe("computeDemandLeakage", () => {
  it("attributes each loss to the first gate it fails", () => {
    const result = computeDemandLeakage([
      input({ hasIntentSignal: false }),
      input({ clarityEnd: 1 }),
      input({ stockUnavailable: true }),
      input({ priceOrFinanceBlocked: true }),
      input({ recommendationMade: false }),
      input({ frictionUnaddressed: true }),
    ]);

    expect(leakedAt(result, "intent")).toBe(1);
    expect(leakedAt(result, "understanding")).toBe(1);
    expect(leakedAt(result, "stock")).toBe(1);
    expect(leakedAt(result, "price")).toBe(1);
    expect(leakedAt(result, "recommendation")).toBe(1);
    expect(leakedAt(result, "friction")).toBe(1);
  });

  it("counts an interaction once, at its earliest blocker only", () => {
    // Fails several gates; only the first may claim it, or the funnel double-counts.
    const result = computeDemandLeakage([
      input({ clarityEnd: 0, stockUnavailable: true, priceOrFinanceBlocked: true }),
    ]);

    expect(leakedAt(result, "understanding")).toBe(1);
    expect(leakedAt(result, "stock")).toBe(0);
    expect(leakedAt(result, "price")).toBe(0);
  });

  it("never attributes a purchase to a leak, whatever friction it met", () => {
    const result = computeDemandLeakage([
      input({ purchased: true, priceOrFinanceBlocked: true, frictionUnaddressed: true }),
    ]);

    expect(result.purchased).toBe(1);
    expect(result.stages.every((stage) => stage.leaked === 0)).toBe(true);
  });

  it("balances: every interaction is either leaked, purchased or unattributed", () => {
    const inputs = [
      input({ hasIntentSignal: false }),
      input({ clarityEnd: 1 }),
      input({ priceOrFinanceBlocked: true }),
      input({ purchased: true }),
      input(), // clears everything, still did not buy
    ];
    const result = computeDemandLeakage(inputs);
    const totalLeaked = result.stages.reduce((sum, stage) => sum + stage.leaked, 0);

    expect(result.total).toBe(inputs.length);
    expect(totalLeaked + result.purchased + result.unattributed).toBe(inputs.length);
    expect(result.unattributed).toBe(1);
  });

  it("reports assortment as unmeasured and never leaks demand to it", () => {
    const assortment = computeDemandLeakage([input()]).stages.find((s) => s.key === "assortment");
    expect(assortment?.measured).toBe(false);
    expect(assortment?.leaked).toBe(0);
    expect(assortment?.note).toMatch(/catalogue/i);
  });

  it("marks availability as claimed, and treats silence as not a stockout", () => {
    const stock = computeDemandLeakage([input()]).stages.find((s) => s.key === "stock");
    expect(stock?.basis).toBe("claimed");
    // stockUnavailable false (nobody said it was out) must not count as a loss.
    expect(stock?.leaked).toBe(0);
  });

  it("does not penalise an interaction whose clarity was never measured", () => {
    const result = computeDemandLeakage([input({ clarityEnd: null })]);
    expect(leakedAt(result, "understanding")).toBe(0);
  });

  it("handles an empty period without dividing by anything", () => {
    const result = computeDemandLeakage([]);
    expect(result.total).toBe(0);
    expect(result.purchased).toBe(0);
    expect(result.stages.every((stage) => stage.reached === 0 || stage.key === "observed")).toBe(
      true,
    );
  });
});
