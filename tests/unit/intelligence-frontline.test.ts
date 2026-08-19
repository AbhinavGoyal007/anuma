import { describe, expect, it } from "vitest";

import {
  computeFrontline,
  normalizeResponseState,
  responseCompositions,
  frontlineActionCohorts,
  outcomeAssociations,
} from "@/modules/intelligence/frontline";
import { readOutcome } from "@/modules/intelligence/outcome";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";

const value = (
  fieldKey: string,
  valueText: string | null,
  label: string | null = null,
  abstention: string | null = null,
  earliestMs: number | null = 0,
): PopulationValue => ({
  fieldKey,
  label,
  valueText,
  valueNumber: null,
  amountMinor: null,
  currency: null,
  abstention,
  hasEvidence: true,
  earliestMs,
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
    arrivalIntent: "comparing",
    clarityStart: 1,
    clarityEnd: 2,
    targetBudgetMinor: null,
    maxBudgetMinor: null,
    budgetCurrency: null,
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

describe("denominators that decide whether a frontline metric is fair", () => {
  it("excludes not-applicable from the demo rate rather than counting it as a failure", () => {
    // A demo that made no sense for the product is not a demo the rep skipped.
    const metrics = computeFrontline([
      row({ demoPerformed: "yes" }),
      row({ demoPerformed: "no" }),
      row({ demoPerformed: "not_applicable" }),
      row({ demoPerformed: null }),
    ]);
    expect(metrics.demoRate.observed).toBe(2);
    expect(metrics.demoRate.value).toBe(0.5);
    expect(metrics.demoRate.eligible).toBe(4);
  });

  it("does not count a record that predates a field as a negative example", () => {
    // The old record carries no cross_sell_pitch row at all. Counting it as "no
    // cross-sell" would make every rate look worse the further back you scroll,
    // purely because the product improved.
    const metrics = computeFrontline([
      row({ values: [value("cross_sell_pitch", "laptop bag", "accessory")] }),
      row({ values: [value("cross_sell_pitch", null, null, "not_stated")] }),
      row({ values: [] }),
    ]);
    expect(metrics.crossSellRate.observed).toBe(2);
    expect(metrics.crossSellRate.value).toBe(0.5);
  });

  it("ignores a stored count that disagrees with the pitches on the record", () => {
    // interaction_metrics is written by whichever version of the pipeline last
    // touched the record. After the v1.3 change the stored count means something
    // different on old rows, and trusting it here reported a confident 100% on
    // records containing no pitch at all.
    const metrics = computeFrontline([
      row({ upsellCount: 3, values: [value("upsell_pitch", null, null, "not_stated")] }),
      row({ upsellCount: 0, values: [value("upsell_pitch", "16 GB to 32 GB", "memory")] }),
    ]);
    expect(metrics.upsellRate.value).toBe(0.5);
  });

  it("measures rationale against interactions that recommended, not against everything", () => {
    const metrics = computeFrontline([
      row({ productsRecommendedCount: 1, values: [value("recommendation_reasons", "battery")] }),
      row({ productsRecommendedCount: 2 }),
      row({ productsRecommendedCount: 0 }),
      row({ productsRecommendedCount: 0 }),
    ]);
    expect(metrics.recommendationRationale.observed).toBe(2);
    expect(metrics.recommendationRationale.value).toBe(0.5);
  });

  it("judges objections per response, not per interaction", () => {
    // One interaction with three objections, two fully handled, should not read
    // as a single fully-handled interaction.
    const metrics = computeFrontline([
      row({
        objectionCount: 3,
        values: [
          value("objection_response", "full"),
          value("objection_response", "full"),
          value("objection_response", "partial"),
        ],
      }),
    ]);
    expect(metrics.fullObjectionHandling.observed).toBe(3);
    expect(metrics.fullObjectionHandling.value).toBeCloseTo(2 / 3, 6);
  });

  it("measures finance response against finance questions, not finance mentions", () => {
    // The old metric read a missing finance-labelled offer as proof that a
    // question went unanswered. The two fields are recorded independently, and
    // the drill-down found a transcript where the rep plainly offered EMI and
    // the offer field was empty. This one only claims what the labels support.
    const metrics = computeFrontline([
      row({
        values: [
          value("customer_questions", "EMI hai kya?", "finance"),
          value("question_response_status", "answered", "finance"),
        ],
      }),
      row({ values: [value("customer_questions", "EMI hai kya?", "finance")] }),
      row({ values: [value("customer_questions", "warranty kitni?", "warranty")] }),
    ]);
    expect(metrics.financeQuestionResponse.observed).toBe(2);
    expect(metrics.financeQuestionResponse.value).toBe(0.5);
  });

  it("keeps a proactive offer separate from answering a question", () => {
    const metrics = computeFrontline([
      row({ values: [value("commercial_offer_made", "2,000 cashback", "promotion")] }),
      row({ values: [value("commercial_offer_made", null, null, "not_stated")] }),
    ]);
    expect(metrics.proactiveOffer.observed).toBe(2);
    expect(metrics.proactiveOffer.value).toBe(0.5);
    // No finance question was asked, so there is nothing to report about one.
    expect(metrics.financeQuestionResponse.value).toBeNull();
  });

  it("normalizes only response wordings that map deterministically", () => {
    expect(normalizeResponseState("Answered")).toBe("answered");
    expect(normalizeResponseState("partially answered")).toBe("partial");
    expect(normalizeResponseState("no response")).toBe("unanswered");
    expect(normalizeResponseState("uncertain")).toBe("uncertain");
    // Anything we cannot map deterministically stays out of the evaluated set
    // rather than being guessed into one.
    expect(normalizeResponseState("rep said he would check")).toBeNull();
    expect(normalizeResponseState(null)).toBeNull();
  });

  it("counts an interaction once however many pitches it contained", () => {
    const metrics = computeFrontline([
      row({
        values: [
          value("cross_sell_pitch", "bag", "accessory"),
          value("cross_sell_pitch", "warranty", "warranty_service_plan"),
          value("cross_sell_pitch", "mouse", "accessory"),
        ],
      }),
      row({ values: [value("cross_sell_pitch", null, null, "not_stated")] }),
    ]);
    expect(metrics.crossSellRate.affected).toBe(1);
    expect(metrics.crossSellRate.value).toBe(0.5);
  });

  it("returns null rather than zero when nothing was eligible", () => {
    const metrics = computeFrontline([row(), row()]);
    expect(metrics.demoRate.value).toBeNull();
    expect(metrics.financeQuestionResponse.value).toBeNull();
  });
});

describe("a close attempt after the customer signalled, not merely present", () => {
  it("counts a close that came after the buying signal", () => {
    const metrics = computeFrontline([
      row({
        values: [
          value("customer_commitment_signals", "I'll take it", null, null, 60_000),
          value("close_attempts", "shall I bill it", null, null, 65_000),
        ],
      }),
    ]);
    expect(metrics.closeAfterCommitment.value).toBe(1);
  });

  it("does not count a close that came before the signal", () => {
    // A close made before the customer signalled anything is a rep working
    // through a script. Treating it as a response would flatter exactly the
    // behaviour this metric exists to find.
    const metrics = computeFrontline([
      row({
        values: [
          value("close_attempts", "shall I bill it", null, null, 20_000),
          value("customer_commitment_signals", "I'll take it", null, null, 60_000),
        ],
      }),
    ]);
    expect(metrics.closeAfterCommitment.observed).toBe(1);
    expect(metrics.closeAfterCommitment.value).toBe(0);
  });

  it("leaves out an interaction whose signal carries no timing", () => {
    // Neither judgement is available, so it is not evidence either way.
    const metrics = computeFrontline([
      row({
        values: [
          value("customer_commitment_signals", "I'll take it", null, null, null),
          value("close_attempts", "shall I bill it", null, null, 5_000),
        ],
      }),
    ]);
    expect(metrics.closeAfterCommitment.observed).toBe(0);
    expect(metrics.closeAfterCommitment.value).toBeNull();
  });

  it("counts several upsell pitches in one interaction once", () => {
    const metrics = computeFrontline([
      row({
        values: [
          value("upsell_pitch", "8 to 16 GB", "memory"),
          value("upsell_pitch", "256 to 512 GB", "storage"),
        ],
      }),
      row({ values: [value("upsell_pitch", null, null, "not_stated")] }),
    ]);
    expect(metrics.upsellRate.affected).toBe(1);
    expect(metrics.upsellRate.value).toBe(0.5);
  });
});

describe("how friction was answered", () => {
  it("counts objection responses per event, not per conversation", () => {
    // A representative who fully answered two of five objections should not
    // read the same as one who answered their only objection.
    const { objection } = responseCompositions([
      row({
        values: [
          value("objection_response", "full"),
          value("objection_response", "partial"),
          value("objection_response", "none"),
        ],
      }),
      row({ values: [value("objection_response", "full")] }),
    ]);
    expect(objection.find((slice) => slice.key === "full")?.count).toBe(2);
    expect(objection.find((slice) => slice.key === "partial")?.count).toBe(1);
    expect(objection.find((slice) => slice.key === "none")?.count).toBe(1);
  });

  it("splits finance questions by whether a response was recorded", () => {
    const { finance } = responseCompositions([
      row({
        values: [
          value("customer_questions", "EMI hai kya?", "finance"),
          value("question_response_status", "answered", "finance"),
        ],
      }),
      row({ values: [value("customer_questions", "EMI hai kya?", "finance")] }),
      row({ values: [value("customer_questions", "warranty kitni?", "warranty")] }),
    ]);
    expect(finance.find((slice) => slice.key === "recorded")?.count).toBe(1);
    expect(finance.find((slice) => slice.key === "unrecorded")?.count).toBe(1);
  });

  it("calls a missing response status an absence, never an unanswered question", () => {
    // The label matters: we know our record is empty, not that nobody replied.
    const { finance } = responseCompositions([
      row({ values: [value("customer_questions", "EMI hai kya?", "finance")] }),
    ]);
    const missing = finance.find((slice) => slice.key === "unrecorded")!;
    expect(missing.label).toBe("No response status recorded");
    expect(missing.label.toLowerCase()).not.toContain("unanswered");
  });
});

describe("the interactions behind each failure", () => {
  it("finds a ready-to-buy customer who was never asked for the sale", () => {
    const cohorts = frontlineActionCohorts([
      row({
        arrivalIntent: "ready_to_buy",
        values: [value("confirmed_business_outcome", "no_sale")],
      }),
      row({
        arrivalIntent: "ready_to_buy",
        values: [
          value("confirmed_business_outcome", "sale"),
          value("close_attempts", "shall I bill it"),
        ],
      }),
    ]);
    const cohort = cohorts.find((c) => c.key === "ready_to_buy_without_close_attempt");
    expect(cohort?.conversationIds).toHaveLength(1);
  });

  it("catches a follow-up agreed with nothing to actually do", () => {
    const cohorts = frontlineActionCohorts([
      row({ values: [value("final_decision_state", "follow_up_scheduled")] }),
      row({
        values: [
          value("final_decision_state", "follow_up_scheduled"),
          value("next_action", "call Saturday"),
        ],
      }),
    ]);
    expect(
      cohorts.find((c) => c.key === "follow_up_without_next_action")?.conversationIds,
    ).toHaveLength(1);
  });

  it("keeps the conversation ids so the count can be opened", () => {
    const cohorts = frontlineActionCohorts([
      row({ productsRecommendedCount: 1 }),
      row({ productsRecommendedCount: 2 }),
    ]);
    const cohort = cohorts.find((c) => c.key === "recommendation_without_rationale");
    expect(cohort?.conversationIds).toHaveLength(2);
    expect(cohort?.conversationIds.every(Boolean)).toBe(true);
  });

  it("orders cohorts by how many interactions they affect", () => {
    const cohorts = frontlineActionCohorts([
      row({ productsRecommendedCount: 1 }),
      row({ productsRecommendedCount: 1 }),
      row({ financeRequested: true }),
    ]);
    expect(cohorts[0]!.key).toBe("recommendation_without_rationale");
  });
});

describe("behaviour against outcome", () => {
  const outcome = (business: "sale" | "no_sale", extra: Partial<PopulationRow> = {}) =>
    row({ ...extra, values: [value("confirmed_business_outcome", business)] });

  const group = (business: "sale" | "no_sale", count: number, withDemo: number) =>
    Array.from({ length: count }, (_, index) =>
      outcome(business, { demoPerformed: index < withDemo ? "yes" : "no" }),
    );

  it("renders nothing at all when either group is too small", () => {
    // One sale against eight no-sales produced differences of sixty percentage
    // points. A disclaimer underneath does not undo the impression the numbers
    // have already made, so the comparison is not computed.
    const result = outcomeAssociations([...group("sale", 1, 1), ...group("no_sale", 8, 2)]);
    expect(result.strength).toBe("suppressed");
    expect(result.rows).toEqual([]);
    expect(result.saleN).toBe(1);
    expect(result.noSaleN).toBe(8);
  });

  it("allows a directional comparison once both groups clear the lower bar", () => {
    const result = outcomeAssociations([...group("sale", 10, 8), ...group("no_sale", 10, 2)]);
    expect(result.strength).toBe("directional");
    expect(result.rows.find((r) => r.behaviourKey === "demo")?.differencePoints).toBeCloseTo(60, 6);
  });

  it("allows an ordinary comparison once both groups are substantial", () => {
    const result = outcomeAssociations([...group("sale", 30, 15), ...group("no_sale", 30, 15)]);
    expect(result.strength).toBe("descriptive");
  });

  it("excludes interactions whose outcome was never established", () => {
    // Filing an unknown outcome under no-sale would manufacture the comparison.
    const result = outcomeAssociations([
      ...group("sale", 10, 5),
      ...group("no_sale", 10, 5),
      ...Array.from({ length: 20 }, () => row({ demoPerformed: "yes", values: [] })),
    ]);
    expect(result.saleN).toBe(10);
    expect(result.noSaleN).toBe(10);
  });

  it("reads cross-sell from the pitch fields, not the stored count", () => {
    // The headline metric already reads the pitch fields. An association that
    // read interaction_metrics instead would disagree with the number printed
    // directly above it.
    const result = outcomeAssociations([
      ...Array.from({ length: 10 }, () =>
        row({
          crossSellCount: 3,
          values: [
            value("confirmed_business_outcome", "sale"),
            value("cross_sell_pitch", null, null, "not_stated"),
          ],
        }),
      ),
      ...Array.from({ length: 10 }, () =>
        row({
          crossSellCount: 0,
          values: [
            value("confirmed_business_outcome", "no_sale"),
            value("cross_sell_pitch", "laptop bag", "accessory"),
          ],
        }),
      ),
    ]);
    const crossSell = result.rows.find((r) => r.behaviourKey === "cross_sell")!;
    expect(crossSell.saleRate).toBe(0);
    expect(crossSell.noSaleRate).toBe(1);
  });
});
