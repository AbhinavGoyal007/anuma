import { describe, expect, it } from "vitest";

import {
  change,
  confidenceFor,
  DEFAULT_GUARDRAILS,
  mayPromote,
  measure,
} from "@/modules/intelligence/guardrails";
import { metricRegistry, metricsFor, metric } from "@/modules/intelligence/metric-registry";
import {
  isFollowUp,
  isOutcomeClassified,
  isUnresolved,
  readOutcome,
  type OutcomeInputValue,
} from "@/modules/intelligence/outcome";
import { atomicFieldKeys } from "@/modules/interaction-record/fields";

describe("when a number has earned its place on the page", () => {
  it("never turns an empty denominator into zero", () => {
    // The failure this prevents: a metric nobody could answer rendering as 0%,
    // which reads as "this never happens" rather than "we did not see it".
    const nothing = measure(0, 0, 0);
    expect(nothing.value).toBeNull();
    expect(nothing.coverage).toBeNull();
    expect(nothing.confidence).toBe("insufficient");
  });

  it("divides by what was observed, not by everything eligible", () => {
    // 40 interactions, only 20 carried the field, 10 of those matched. The rate
    // is 50% of what we could see — not 25% of everything, which would count
    // every unanswered interaction as a negative example.
    const m = measure(10, 40, 20);
    expect(m.value).toBe(0.5);
    expect(m.coverage).toBe(0.5);
  });

  it("grades confidence off the observed count", () => {
    expect(confidenceFor(9)).toBe("insufficient");
    expect(confidenceFor(10)).toBe("directional");
    expect(confidenceFor(30)).toBe("comparable");
    expect(confidenceFor(100)).toBe("trendworthy");
  });

  it("refuses to promote a well-sampled metric with thin coverage", () => {
    // 60 observed clears the sample bar, but only 60 of 200 eligible carried the
    // field. Headlining that would generalise from a third of the population.
    const thin = measure(30, 200, 60);
    expect(thin.confidence).toBe("comparable");
    expect(mayPromote(thin)).toBe(false);
    expect(mayPromote(measure(30, 70, 60))).toBe(true);
  });

  it("will not call a change comparable when either period is thin", () => {
    const solid = measure(30, 60, 60);
    const thin = measure(3, 6, 6);
    expect(change(solid, thin).comparable).toBe(false);
    expect(change(solid, solid).comparable).toBe(true);
  });

  it("reports the delta in percentage points", () => {
    const c = change(measure(30, 60, 60), measure(24, 60, 60));
    expect(c.deltaPoints).toBeCloseTo(10, 6);
  });

  it("keeps the guardrails in one place", () => {
    expect(DEFAULT_GUARDRAILS.minimumCoverage).toBeGreaterThan(0);
    expect(DEFAULT_GUARDRAILS.minimumForComparison).toBeLessThan(
      DEFAULT_GUARDRAILS.minimumForConfidentDisplay,
    );
  });
});

describe("the two axes an interaction ends on", () => {
  const value = (
    fieldKey: string,
    valueText: string | null,
    abstention: string | null = null,
  ): OutcomeInputValue => ({ fieldKey, valueText, abstention });

  it("keeps the business outcome and the decision state apart", () => {
    // The ordinary case: the customer agreed to come back, so they landed on a
    // follow-up and the store got no sale. Neither field is wrong.
    const outcome = readOutcome([
      value("confirmed_business_outcome", "no_sale"),
      value("final_decision_state", "follow_up_scheduled"),
    ]);
    expect(outcome.business).toBe("no_sale");
    expect(outcome.decision).toBe("follow_up_scheduled");
    expect(isFollowUp(outcome)).toBe(true);
    expect(isUnresolved(outcome)).toBe(true);
  });

  it("treats an abstained outcome as unknown rather than a no sale", () => {
    const outcome = readOutcome([
      value("confirmed_business_outcome", null, "insufficient_evidence"),
    ]);
    expect(outcome.business).toBe("unknown");
    expect(isOutcomeClassified(outcome)).toBe(false);
    // Unknown is exactly the case worth a manager's attention, so it stays in
    // the unresolved population rather than being filtered away as untidy.
    expect(isUnresolved(outcome)).toBe(true);
  });

  it("does not treat a decided customer as unresolved", () => {
    expect(isUnresolved(readOutcome([value("confirmed_business_outcome", "sale")]))).toBe(false);
    expect(isUnresolved(readOutcome([value("final_decision_state", "rejected")]))).toBe(false);
  });

  it("ignores a value outside the vocabulary rather than trusting it", () => {
    const outcome = readOutcome([value("confirmed_business_outcome", "follow_up")]);
    expect(outcome.business).toBe("unknown");
  });
});

describe("the metric registry", () => {
  it("has no duplicate keys", () => {
    const keys = metricRegistry.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only requires fields that exist in the atomic registry", () => {
    // A metric depending on a field nobody extracts is a metric that renders an
    // empty state for ever, and it fails here rather than on the page.
    const known = new Set<string>(atomicFieldKeys);
    for (const definition of metricRegistry) {
      for (const field of [...definition.requiredFields, ...definition.drilldownFieldKeys]) {
        expect(known.has(field), `${definition.key} references unknown field ${field}`).toBe(true);
      }
    }
  });

  it("states a denominator wherever it reports a percentage", () => {
    for (const definition of metricRegistry) {
      if (definition.format !== "percent") continue;
      const stated = definition.denominatorRule ?? definition.eligibilityRule;
      expect(stated.length, `${definition.key} has no denominator`).toBeGreaterThan(10);
    }
  });

  it("covers all three modules", () => {
    expect(metricsFor("customer_demand").length).toBeGreaterThan(0);
    expect(metricsFor("customer_journey").length).toBeGreaterThan(0);
    expect(metricsFor("frontline").length).toBeGreaterThan(0);
  });

  it("marks an approximated formula as provisional rather than hiding it", () => {
    // Recommendation rationale cannot be matched event to event yet, because the
    // record stores reasons without saying which recommendation they belong to.
    expect(metric("recommendation_rationale").provisional).toBeTruthy();
  });

  it("throws on an unknown metric instead of returning undefined", () => {
    expect(() => metric("no_such_metric")).toThrow();
  });
});
