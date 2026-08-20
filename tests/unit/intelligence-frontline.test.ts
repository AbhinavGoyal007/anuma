import { describe, expect, it } from "vitest";

import {
  computeFrontline,
  frontlineActionCohorts,
  normalizeResponseState,
  outcomeAssociations,
  responseCompositions,
} from "@/modules/intelligence/frontline";
import { notStated, row, unreadable, value } from "../support/population";

/**
 * Denominators, and the difference between "no" and "we cannot tell".
 *
 * Every fixture is built through the same effective reader the loader uses, so
 * a passing test is a statement about the real precedence rule rather than
 * about a hand-assembled row the production path could never produce.
 */

describe("denominators that decide whether a frontline metric is fair", () => {
  it("excludes not-applicable from the demo rate rather than counting it as a failure", () => {
    // A demo that made no sense for the product is not a demo the rep skipped.
    // It stays eligible and leaves the observed set; a record that never
    // carried the field is not eligible at all.
    const metrics = computeFrontline([
      row({ values: [value("product_demo_performed", "yes")] }),
      row({ values: [value("product_demo_performed", "no")] }),
      row({ values: [value("product_demo_performed", "not_applicable")] }),
      row({ values: [] }),
    ]);
    expect(metrics.demoRate.observed).toBe(2);
    expect(metrics.demoRate.value).toBe(0.5);
    // Two eligible, not three: "not applicable" leaves the denominator
    // altogether rather than reducing the coverage of the applicable rate.
    expect(metrics.demoRate.eligible).toBe(2);
  });

  it("matches the specified demo fixture exactly", () => {
    // yes=2, no=3, not_applicable=5 → 2/5 = 40%, over ten eligible.
    const metrics = computeFrontline([
      ...Array.from({ length: 2 }, () => row({ values: [value("product_demo_performed", "yes")] })),
      ...Array.from({ length: 3 }, () => row({ values: [value("product_demo_performed", "no")] })),
      ...Array.from({ length: 5 }, () =>
        row({ values: [value("product_demo_performed", "not_applicable")] }),
      ),
    ]);
    expect(metrics.demoRate.value).toBe(0.4);
    expect(metrics.demoRate.observed).toBe(5);
    // The five not-applicable interactions are excluded outright.
    expect(metrics.demoRate.eligible).toBe(5);
  });

  it("applies the same applicability rule to alternatives", () => {
    const metrics = computeFrontline([
      ...Array.from({ length: 2 }, () => row({ values: [value("alternative_offered", "yes")] })),
      ...Array.from({ length: 3 }, () => row({ values: [value("alternative_offered", "no")] })),
      ...Array.from({ length: 5 }, () =>
        row({ values: [value("alternative_offered", "not_applicable")] }),
      ),
    ]);
    expect(metrics.alternativeRate.value).toBe(0.4);
    expect(metrics.alternativeRate.observed).toBe(5);
  });

  it("matches the specified finance fixture exactly", () => {
    // 10 rows; 6 carry the field; 3 raised finance; 3 explicitly did not; 4
    // never carried it. The four are not falses.
    const metrics = computeFrontline([
      ...Array.from({ length: 3 }, () => row({ values: [value("finance_requested", "EMI")] })),
      ...Array.from({ length: 3 }, () => row({ values: [notStated("finance_requested")] })),
      ...Array.from({ length: 4 }, () => row({ values: [] })),
    ]);
    expect(metrics.financeDemand.value).toBe(0.5);
    expect(metrics.financeDemand.affected).toBe(3);
    expect(metrics.financeDemand.observed).toBe(6);
    expect(metrics.financeDemand.eligible).toBe(6);
    expect(metrics.financeDemand.coverage).toBe(1);
  });

  it("keeps an unreadable field out of the denominator rather than calling it no", () => {
    // "The audio does not settle it" and "it never came up" are different
    // commercial facts. Collapsing them makes every rate look worse the noisier
    // the recording was.
    const metrics = computeFrontline([
      row({ values: [value("finance_requested", "EMI")] }),
      row({ values: [unreadable("finance_requested")] }),
    ]);
    expect(metrics.financeDemand.eligible).toBe(2);
    expect(metrics.financeDemand.observed).toBe(1);
    expect(metrics.financeDemand.value).toBe(1);
    expect(metrics.financeDemand.coverage).toBe(0.5);
  });

  it("does not count a record that predates a field as a negative example", () => {
    const metrics = computeFrontline([
      row({ values: [value("cross_sell_pitch", "laptop bag", { label: "accessory" })] }),
      row({ values: [notStated("cross_sell_pitch")] }),
      row({ values: [] }),
    ]);
    expect(metrics.crossSellRate.observed).toBe(2);
    expect(metrics.crossSellRate.value).toBe(0.5);
  });

  it("reads a legacy cross-sell field where the current one was never written", () => {
    // The pitch fields replaced *_offered. Reading only the current key made
    // every older interaction look like a missed opportunity.
    const metrics = computeFrontline([
      row({ values: [value("cross_sell_offered", "yes")] }),
      row({ values: [notStated("cross_sell_offered")] }),
    ]);
    expect(metrics.crossSellRate.observed).toBe(2);
    expect(metrics.crossSellRate.value).toBe(0.5);
  });

  it("ignores a stored count that disagrees with the pitches on the record", () => {
    // interaction_metrics is written by whichever version of the pipeline last
    // touched the record. Where the atomic field exists it wins outright.
    const metrics = computeFrontline([
      row({ values: [notStated("upsell_pitch")], projection: { productsRecommendedCount: 3 } }),
      row({ values: [value("upsell_pitch", "16 GB to 32 GB", { label: "memory" })] }),
    ]);
    expect(metrics.upsellRate.value).toBe(0.5);
  });

  it("lets a human correction overturn what the projection claims", () => {
    // The projection says a recommendation happened. The atomic field, after
    // the correction removed the rejected value, says none did.
    const corrected = row({
      values: [notStated("products_recommended")],
      projection: { productsRecommendedCount: 1 },
    });
    expect(corrected.recommendedCount).toBe(0);
    expect(computeFrontline([corrected]).recommendationRate.value).toBe(0);
    expect(
      frontlineActionCohorts([corrected]).find(
        (cohort) => cohort.key === "recommendation_without_rationale",
      ),
    ).toBeUndefined();
  });

  it("measures rationale against interactions that recommended, not against everything", () => {
    const metrics = computeFrontline([
      row({
        values: [
          value("products_recommended", "Acer Swift"),
          value("recommendation_reasons", "battery"),
        ],
      }),
      row({
        values: [value("products_recommended", "Dell 14"), notStated("recommendation_reasons")],
      }),
      row({ values: [notStated("products_recommended")] }),
      row({ values: [notStated("products_recommended")] }),
    ]);
    expect(metrics.recommendationRationale.observed).toBe(2);
    expect(metrics.recommendationRationale.value).toBe(0.5);
  });

  it("judges objections per response, not per interaction", () => {
    const metrics = computeFrontline([
      row({
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
    const metrics = computeFrontline([
      row({
        values: [
          value("customer_questions", "EMI hai kya?", { label: "finance" }),
          value("question_response_status", "answered", { label: "finance" }),
        ],
      }),
      row({ values: [value("customer_questions", "EMI hai kya?", { label: "finance" })] }),
      row({ values: [value("customer_questions", "warranty kitni?", { label: "warranty" })] }),
    ]);
    expect(metrics.financeQuestionResponse.observed).toBe(2);
    expect(metrics.financeQuestionResponse.value).toBe(0.5);
  });

  it("keeps a proactive offer separate from answering a question", () => {
    const metrics = computeFrontline([
      row({
        values: [value("commercial_offer_made", "2,000 cashback", { label: "promotion" })],
      }),
      row({ values: [notStated("commercial_offer_made")] }),
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
    expect(normalizeResponseState("rep said he would check")).toBeNull();
    expect(normalizeResponseState(null)).toBeNull();
  });

  it("counts an interaction once however many pitches it contained", () => {
    const metrics = computeFrontline([
      row({
        values: [
          value("cross_sell_pitch", "bag", { label: "accessory" }),
          value("cross_sell_pitch", "warranty", { label: "warranty_service_plan" }),
          value("cross_sell_pitch", "mouse", { label: "accessory" }),
        ],
      }),
      row({ values: [notStated("cross_sell_pitch")] }),
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
          value("customer_commitment_signals", "I'll take it", { earliestMs: 10_000 }),
          value("close_attempts", "shall I bill it", { earliestMs: 20_000 }),
        ],
      }),
    ]);
    expect(metrics.closeAfterCommitment.value).toBe(1);
  });

  it("does not count a close that came before the signal", () => {
    const metrics = computeFrontline([
      row({
        values: [
          value("close_attempts", "shall I bill it", { earliestMs: 10_000 }),
          value("customer_commitment_signals", "I'll take it", { earliestMs: 20_000 }),
        ],
      }),
    ]);
    expect(metrics.closeAfterCommitment.observed).toBe(1);
    expect(metrics.closeAfterCommitment.value).toBe(0);
  });

  it("leaves out an interaction whose signal carries no timing", () => {
    // Neither judgement is available, so it is not evidence either way — but it
    // stays eligible, so the coverage gap is visible.
    const metrics = computeFrontline([
      row({
        values: [
          value("customer_commitment_signals", "I'll take it", { earliestMs: null }),
          value("close_attempts", "shall I bill it", { earliestMs: 5_000 }),
        ],
      }),
    ]);
    expect(metrics.closeAfterCommitment.observed).toBe(0);
    expect(metrics.closeAfterCommitment.eligible).toBe(1);
    expect(metrics.closeAfterCommitment.value).toBeNull();
  });

  it("counts several upsell pitches in one interaction once", () => {
    const metrics = computeFrontline([
      row({
        values: [
          value("upsell_pitch", "8 to 16 GB", { label: "memory" }),
          value("upsell_pitch", "256 to 512 GB", { label: "storage" }),
        ],
      }),
      row({ values: [notStated("upsell_pitch")] }),
    ]);
    expect(metrics.upsellRate.affected).toBe(1);
    expect(metrics.upsellRate.value).toBe(0.5);
  });
});

describe("how friction was answered", () => {
  it("counts objection responses per event, not per conversation", () => {
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
          value("customer_questions", "EMI hai kya?", { label: "finance" }),
          value("question_response_status", "answered", { label: "finance" }),
        ],
      }),
      row({ values: [value("customer_questions", "EMI hai kya?", { label: "finance" })] }),
      row({ values: [value("customer_questions", "warranty kitni?", { label: "warranty" })] }),
    ]);
    expect(finance.find((slice) => slice.key === "recorded")?.count).toBe(1);
    expect(finance.find((slice) => slice.key === "unrecorded")?.count).toBe(1);
  });

  it("calls a missing response status an absence, never an unanswered question", () => {
    // The label matters: we know our record is empty, not that nobody replied.
    const { finance } = responseCompositions([
      row({ values: [value("customer_questions", "EMI hai kya?", { label: "finance" })] }),
    ]);
    const missing = finance.find((slice) => slice.key === "unrecorded")!;
    expect(missing.label).toBe("No response status recorded");
    expect(missing.label.toLowerCase()).not.toContain("unanswered");
  });
});

describe("the interactions behind each failure", () => {
  it("finds a ready-to-buy customer who was never asked for the sale", () => {
    const cohorts = frontlineActionCohorts([
      // Ready to buy, outcome never established, close attempt definitively
      // absent: the one interaction a manager can act on.
      row({
        values: [
          value("arrival_intent_state", "ready_to_buy"),
          notStated("confirmed_business_outcome"),
          notStated("close_attempts"),
        ],
      }),
      // A confirmed no-sale belongs to the confirmed-outcome cohorts, not here.
      row({
        values: [
          value("arrival_intent_state", "ready_to_buy"),
          value("confirmed_business_outcome", "no_sale"),
          notStated("close_attempts"),
        ],
      }),
      row({
        values: [
          value("arrival_intent_state", "ready_to_buy"),
          value("confirmed_business_outcome", "sale"),
          value("close_attempts", "shall I bill it"),
        ],
      }),
    ]);
    expect(
      cohorts.find((c) => c.key === "ready_to_buy_without_close_attempt")?.conversationIds,
    ).toHaveLength(1);
  });

  it("catches a follow-up agreed with nothing to actually do", () => {
    const cohorts = frontlineActionCohorts([
      row({
        values: [value("final_decision_state", "follow_up_scheduled"), notStated("next_action")],
      }),
      row({
        values: [
          value("final_decision_state", "follow_up_scheduled"),
          value("next_action", "call Saturday"),
        ],
      }),
      // Unreadable rather than absent: a data-quality question, not a gap.
      row({
        values: [value("final_decision_state", "follow_up_scheduled"), unreadable("next_action")],
      }),
    ]);
    expect(
      cohorts.find((c) => c.key === "follow_up_without_next_action")?.conversationIds,
    ).toHaveLength(1);
  });

  it("keeps the conversation ids so the count can be opened", () => {
    const cohorts = frontlineActionCohorts([
      row({
        values: [value("products_recommended", "Acer Swift"), notStated("recommendation_reasons")],
      }),
      row({
        values: [value("products_recommended", "Dell 14"), notStated("recommendation_reasons")],
      }),
    ]);
    const cohort = cohorts.find((c) => c.key === "recommendation_without_rationale");
    expect(cohort?.conversationIds).toHaveLength(2);
    expect(cohort?.conversationIds.every(Boolean)).toBe(true);
  });

  it("orders cohorts by how many interactions they affect", () => {
    const cohorts = frontlineActionCohorts([
      row({
        values: [value("products_recommended", "Acer Swift"), notStated("recommendation_reasons")],
      }),
      row({
        values: [value("products_recommended", "Dell 14"), notStated("recommendation_reasons")],
      }),
      row({
        values: [
          value("customer_questions", "EMI hai kya?", { label: "finance" }),
          value("finance_requested", "EMI"),
        ],
      }),
    ]);
    expect(cohorts[0]!.key).toBe("recommendation_without_rationale");
  });
});

describe("behaviour against outcome", () => {
  const sample = (business: "sale" | "no_sale", count: number, withDemo: number) =>
    Array.from({ length: count }, (_, index) =>
      row({
        values: [
          value("confirmed_business_outcome", business),
          value("product_demo_performed", index < withDemo ? "yes" : "no"),
        ],
      }),
    );

  const demoOf = (result: ReturnType<typeof outcomeAssociations>) =>
    result.rows.find((behaviour) => behaviour.behaviourKey === "demo")!;

  it("suppresses a behaviour whose own eligible population is too small", () => {
    // One sale against eight no-sales produced differences of sixty percentage
    // points. A disclaimer underneath does not undo the impression the numbers
    // have already made, so the comparison is not offered.
    const result = outcomeAssociations([...sample("sale", 1, 1), ...sample("no_sale", 8, 2)]);
    expect(demoOf(result).strength).toBe("suppressed");
    expect(demoOf(result).differencePoints).toBeNull();
    expect(result.saleTotal).toBe(1);
    expect(result.noSaleTotal).toBe(8);
  });

  it("allows a directional comparison once both sides clear the lower bar", () => {
    const result = outcomeAssociations([...sample("sale", 10, 8), ...sample("no_sale", 10, 2)]);
    expect(demoOf(result).strength).toBe("directional");
    expect(demoOf(result).differencePoints).toBeCloseTo(60, 6);
  });

  it("allows an ordinary comparison once both sides are substantial", () => {
    const result = outcomeAssociations([...sample("sale", 30, 15), ...sample("no_sale", 30, 15)]);
    expect(demoOf(result).strength).toBe("descriptive");
  });

  it("gives every behaviour its own denominator on each side", () => {
    // Demo applied to everyone; only the sales carry a commitment signal, so
    // only they can be asked whether a close followed one. A single shared
    // "sales N" would count the non-sales as closes nobody attempted rather
    // than as interactions where the question never arose.
    const result = outcomeAssociations([
      ...Array.from({ length: 12 }, () =>
        row({
          values: [
            value("confirmed_business_outcome", "sale"),
            value("product_demo_performed", "yes"),
            value("customer_commitment_signals", "I'll take it", { earliestMs: 10_000 }),
            value("close_attempts", "shall I bill it", { earliestMs: 20_000 }),
          ],
        }),
      ),
      ...Array.from({ length: 12 }, () =>
        row({
          values: [
            value("confirmed_business_outcome", "no_sale"),
            value("product_demo_performed", "no"),
          ],
        }),
      ),
    ]);
    expect(demoOf(result).saleN).toBe(12);
    expect(demoOf(result).noSaleN).toBe(12);
    const close = result.rows.find((behaviour) => behaviour.behaviourKey === "close")!;
    expect(close.saleN).toBe(12);
    expect(close.noSaleN).toBe(0);
    expect(close.strength).toBe("suppressed");
  });

  it("excludes interactions whose outcome was never established", () => {
    // Filing an unknown outcome under no-sale would manufacture the comparison.
    const result = outcomeAssociations([
      ...sample("sale", 10, 5),
      ...sample("no_sale", 10, 5),
      ...Array.from({ length: 20 }, () =>
        row({ values: [value("product_demo_performed", "yes")] }),
      ),
    ]);
    expect(result.saleTotal).toBe(10);
    expect(result.noSaleTotal).toBe(10);
    expect(demoOf(result).saleN).toBe(10);
  });

  it("reads cross-sell from the pitch fields, not a stored count", () => {
    const result = outcomeAssociations([
      ...Array.from({ length: 10 }, () =>
        row({
          values: [value("confirmed_business_outcome", "sale"), notStated("cross_sell_pitch")],
        }),
      ),
      ...Array.from({ length: 10 }, () =>
        row({
          values: [
            value("confirmed_business_outcome", "no_sale"),
            value("cross_sell_pitch", "laptop bag", { label: "accessory" }),
          ],
        }),
      ),
    ]);
    const crossSell = result.rows.find((behaviour) => behaviour.behaviourKey === "cross_sell")!;
    expect(crossSell.saleRate).toBe(0);
    expect(crossSell.noSaleRate).toBe(1);
  });
});
