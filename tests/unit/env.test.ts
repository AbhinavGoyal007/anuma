import { describe, expect, it } from "vitest";

import { parsePublicEnvironment } from "@/lib/env";

describe("parsePublicEnvironment", () => {
  it("accepts the two public Supabase values required by the client", () => {
    const environment = parsePublicEnvironment({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });

    expect(environment.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
  });

  it("rejects a missing publishable key", () => {
    expect(() =>
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow();
  });
});
