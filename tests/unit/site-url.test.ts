import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { getSiteOrigin } from "@/lib/site-url";

const originalNodeEnv = process.env.NODE_ENV;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalVercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return {
    url,
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = originalVercelProductionUrl;
});

describe("getSiteOrigin", () => {
  it("normalizes a configured hosted URL to HTTPS", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://anumaai-ten.vercel.app";

    expect(getSiteOrigin(request("http://anumaai-ten.vercel.app/sign-up"))).toBe(
      "https://anumaai-ten.vercel.app",
    );
  });

  it("uses the canonical ANUMA origin in production when no URL is configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

    expect(
      getSiteOrigin(
        request("http://internal/sign-up", {
          host: "attacker.example",
          "x-forwarded-host": "attacker.example",
        }),
      ),
    ).toBe("https://anumaai-ten.vercel.app");
  });

  it("allows localhost HTTP during development", () => {
    process.env.NODE_ENV = "test";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

    expect(
      getSiteOrigin(
        request("http://localhost:3000/sign-up", {
          host: "localhost:3000",
          "x-forwarded-proto": "http",
        }),
      ),
    ).toBe("http://localhost:3000");
  });
});
