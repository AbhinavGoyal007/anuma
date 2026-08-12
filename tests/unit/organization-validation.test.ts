import { describe, expect, it } from "vitest";

import {
  locationSchema,
  organizationSetupSchema,
  teamSchema,
} from "@/modules/organizations/validation";

describe("organization validation", () => {
  it("normalizes an India-focused organization setup", () => {
    const result = organizationSetupSchema.parse({
      name: "  ANUMA Pilot  ",
      countryCode: "in",
      defaultCurrency: "inr",
      timezone: "Asia/Kolkata",
    });

    expect(result).toEqual({
      name: "ANUMA Pilot",
      countryCode: "IN",
      defaultCurrency: "INR",
      timezone: "Asia/Kolkata",
    });
  });

  it("rejects malformed country and currency codes", () => {
    expect(() =>
      organizationSetupSchema.parse({
        name: "Pilot",
        countryCode: "India",
        defaultCurrency: "rupees",
        timezone: "Asia/Kolkata",
      }),
    ).toThrow();
  });

  it("validates lightweight location and team input", () => {
    expect(locationSchema.parse({ name: "Showroom One", locationType: "showroom" }).name).toBe(
      "Showroom One",
    );
    expect(teamSchema.parse({ name: "Frontline Team" }).name).toBe("Frontline Team");
  });
});
