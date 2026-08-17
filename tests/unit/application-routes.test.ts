import { describe, expect, it } from "vitest";

import { applicationRoutes, getApplicationRoute } from "@/modules/application/routes";

describe("application route registry", () => {
  it("contains the protected destinations, including the field library", () => {
    expect(applicationRoutes.map((route) => route.href)).toEqual([
      "/conversations",
      "/customer-intelligence",
      "/frontline-performance",
      "/intelligence/overview",
      "/intelligence/demand",
      "/intelligence/frontline",
      "/intelligence/journey",
      "/outcome-intelligence",
      "/field-library",
      "/administration",
    ]);
  });

  it("provides the intended empty state for a registered route", () => {
    expect(getApplicationRoute("/conversations").description).toContain("Prepared interactions");
  });
});
