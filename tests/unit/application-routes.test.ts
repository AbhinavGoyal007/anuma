import { describe, expect, it } from "vitest";

import { applicationRoutes, getApplicationRoute } from "@/modules/application/routes";

describe("application route registry", () => {
  it("contains the protected destinations, including the field library", () => {
    // One Intelligence area, in reading order. The superseded analytics routes
    // still resolve — they redirect — but they are no longer destinations, so a
    // manager is never offered two doors into the same question.
    expect(applicationRoutes.map((route) => route.href)).toEqual([
      "/conversations",
      "/intelligence/overview",
      "/intelligence/demand",
      "/intelligence/journey",
      "/intelligence/frontline",
      "/field-library",
      "/administration",
    ]);
  });

  it("provides the intended empty state for a registered route", () => {
    expect(getApplicationRoute("/conversations").description).toContain("Prepared interactions");
  });
});
