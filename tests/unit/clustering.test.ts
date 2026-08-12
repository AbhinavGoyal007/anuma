import { describe, expect, it } from "vitest";

import {
  clusterObjection,
  clusterThemes,
  clusterTiming,
} from "@/modules/interaction-metrics/clustering";

/**
 * The clustering is approximate by admission, but the common cases must land in
 * the right bucket or the "why demand leaks" panel is noise. These pin the
 * categories that actually recur on an Indian retail floor, in both scripts.
 */

describe("clusterObjection", () => {
  it("folds price wording, English and Hindi, into one bucket", () => {
    expect(clusterObjection("it's too expensive for my budget")).toBe("price / budget");
    expect(clusterObjection("ye thoda mehenga hai")).toBe("price / budget");
    expect(clusterObjection("2 BHK के लिए ये बजट से बाहर है")).toBe("price / budget");
  });

  it("separates finance from price", () => {
    expect(clusterObjection("what will the EMI be?")).toBe("finance / EMI");
  });

  it("catches weight, stock, warranty and competitor concerns", () => {
    expect(clusterObjection("the laptop is too heavy to carry")).toBe("weight / size");
    expect(clusterObjection("is it in stock or do we wait for delivery?")).toBe("stock / delivery");
    expect(clusterObjection("how long is the warranty?")).toBe("warranty / service");
    expect(clusterObjection("Amazon pe sasta mil raha hai")).toBe("competitor / cheaper elsewhere");
  });

  it("falls back to other rather than guessing", () => {
    expect(clusterObjection("the colour options are limited")).toBe("other");
    expect(clusterObjection(null)).toBe("other");
  });
});

describe("clusterTiming", () => {
  it("reads urgency across scripts", () => {
    expect(clusterTiming("I need it this week")).toBe("immediate");
    expect(clusterTiming("parso aaunga")).toBe("within days");
    expect(clusterTiming("after Diwali we'll decide")).toBe("later / after event");
    expect(clusterTiming("just exploring options for now")).toBe("just exploring");
  });

  it("is unspecified when nothing signals a timeframe", () => {
    expect(clusterTiming("we discussed the specifications")).toBe("unspecified");
  });
});

describe("clusterThemes", () => {
  it("returns every curated theme a single utterance touches", () => {
    const themes = clusterThemes("needs a light laptop for gaming with good battery");
    expect(themes).toContain("portability / weight");
    expect(themes).toContain("gaming");
    expect(themes).toContain("battery life");
  });

  it("recognises price and financing across scripts", () => {
    expect(clusterThemes("ye thoda mehenga hai")).toContain("price / budget");
    expect(clusterThemes("EMI kitni padegi, no-cost hai kya?")).toContain("financing / EMI");
  });

  it("returns nothing when no curated theme matches", () => {
    expect(clusterThemes("the colour options were fine")).toEqual([]);
    expect(clusterThemes(null)).toEqual([]);
  });
});
