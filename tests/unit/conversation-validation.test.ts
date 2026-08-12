import { describe, expect, it } from "vitest";

import { conversationSetupSchema } from "@/modules/conversations/validation";

describe("conversation setup validation", () => {
  it("normalizes optional scope identifiers to null", () => {
    const result = conversationSetupSchema.parse({
      title: "  Walk-in visit  ",
      vertical: "automotive",
      locationId: "",
      teamId: "",
      consentStatus: "unknown",
      consentCaptureMethod: "verbal",
    });

    expect(result.title).toBe("Walk-in visit");
    expect(result.locationId).toBeNull();
    expect(result.teamId).toBeNull();
  });

  it("rejects unsupported vertical and consent values", () => {
    expect(() =>
      conversationSetupSchema.parse({
        vertical: "real_estate",
        locationId: "",
        teamId: "",
        consentStatus: "assumed",
        consentCaptureMethod: "verbal",
      }),
    ).toThrow();
  });
});
