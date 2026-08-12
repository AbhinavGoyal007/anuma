import { describe, expect, it } from "vitest";

import { amountToMinor, scaledMajor } from "@/modules/analysis/amount-scale";

/**
 * The bug these guard against was silent and expensive: a customer saying
 * "35 lakh" was stored as ₹35, so every rupee aggregate — average budget, price
 * bands, the value of demand that walked out — was wrong by 100,000×, while
 * still looking like a plausible number on a dashboard.
 */

describe("scaledMajor", () => {
  it("applies the scale word the speaker actually used", () => {
    expect(scaledMajor(35, "lakh")).toBe(3_500_000);
    expect(scaledMajor(1, "crore")).toBe(10_000_000);
    expect(scaledMajor(80, "thousand")).toBe(80_000);
  });

  it("treats a bare number as a bare number", () => {
    expect(scaledMajor(78_000, "unit")).toBe(78_000);
    expect(scaledMajor(78_000, null)).toBe(78_000);
  });

  it("handles the western scales too", () => {
    expect(scaledMajor(2, "million")).toBe(2_000_000);
    expect(scaledMajor(1.5, "billion")).toBe(1_500_000_000);
  });

  it("carries fractional amounts, which people do say", () => {
    // "saade teen lakh", "1.5 crore"
    expect(scaledMajor(3.5, "lakh")).toBe(350_000);
    expect(scaledMajor(1.5, "crore")).toBe(15_000_000);
  });

  it("keeps a missing amount missing rather than making it zero", () => {
    expect(scaledMajor(null, "lakh")).toBeNull();
    expect(scaledMajor(Number.NaN, "lakh")).toBeNull();
    expect(scaledMajor(-5, "lakh")).toBeNull();
  });
});

describe("amountToMinor", () => {
  it("stores the real value, not the spoken digits", () => {
    // The regression: "35 लाख" used to land as 3500 minor units (₹35).
    expect(amountToMinor(35, "lakh", "INR")).toBe(350_000_000);
    expect(amountToMinor(35, "lakh", "INR")).not.toBe(3_500);
  });

  it("handles the rep's quote in the same call", () => {
    // "55 60 lakh" — the 2 BHK market price the representative quoted.
    expect(amountToMinor(55, "lakh", "INR")).toBe(550_000_000);
  });

  it("still handles amounts spoken in full", () => {
    expect(amountToMinor(78_000, "unit", "INR")).toBe(7_800_000);
  });

  it("stores whole minor units for the fractional amounts people actually say", () => {
    // "saade teen lakh" and "1.5 crore" are common; sub-rupee fractions are not.
    expect(amountToMinor(3.5, "lakh", "INR")).toBe(35_000_000);
    expect(amountToMinor(1.5, "crore", "INR")).toBe(1_500_000_000);
  });

  it("refuses to store a number with no currency as money", () => {
    expect(amountToMinor(35, "lakh", null)).toBeNull();
    expect(amountToMinor(35, "lakh", "XYZ")).toBeNull();
  });
});
