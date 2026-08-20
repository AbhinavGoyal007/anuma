import { defineConfig, devices } from "@playwright/test";

/**
 * Two servers, because the two suites need two different products.
 *
 * The demo deployment signs an anonymous visitor into the synthetic tenant, so
 * on that server "an unauthenticated visitor is sent to sign-in" is false — and
 * the anonymous tests only ever passed when Supabase happened to throttle the
 * sign-in and the autologin silently failed. A suite whose result depends on a
 * rate limit is not a test. The anonymous tests get their own server with the
 * demo credentials removed, where the redirect they assert is the real one.
 */
// The anonymous suite keeps port 3000: NEXT_PUBLIC_SITE_URL is inlined at
// build time and the auth redirects are the only thing that reads it, so the
// suite that exercises them owns the origin the build was made for.
const publicURL = "http://127.0.0.1:3000";
const baseURL = "http://127.0.0.1:3001";

/** Written by tests/auth.setup.ts, gitignored, never committed. */
const AUTH_FILE = "playwright/.auth/manager.json";

const start = process.platform === "win32" ? "npm.cmd run start" : "npm run start";

const TABLET = {
  browserName: "chromium" as const,
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  viewport: { width: 768, height: 1024 },
};

export default defineConfig({
  // The whole tests/ tree, so tests/auth.setup.ts is in scope — but only the
  // browser specs and the setup file. Everything else under tests/ belongs to
  // vitest or to the acceptance scripts, and Playwright must not try to run it.
  testDir: "./tests",
  testMatch: [/tests\/e2e\/.*\.spec\.ts$/, /tests\/auth\.setup\.ts$/],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // Every assertion here waits on a real page transition against a remote
  // database — four seconds is normal, and more with six projects sharing the
  // machine. Playwright's five-second default made the suite report how busy
  // the machine was rather than whether the product worked. The assertions are
  // unchanged; only the patience is.
  expect: { timeout: 15_000 },
  projects: [
    // Runs first. Every authenticated project depends on it, so a session that
    // cannot be established fails the run rather than skipping it.
    { name: "setup", testMatch: /auth\.setup\.ts/ },

    // Truly anonymous journeys, kept apart from the signed-in ones: they assert
    // that an unauthenticated visitor is sent to sign-in, which a stored
    // session would quietly break.
    {
      name: "public",
      testIgnore: [/auth\.setup\.ts/, /intelligence-.*\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], baseURL: publicURL },
    },
    {
      name: "public-phone",
      testIgnore: [/auth\.setup\.ts/, /intelligence-.*\.spec\.ts/],
      use: { ...devices["Pixel 5"], baseURL: publicURL },
    },
    {
      name: "public-tablet",
      testIgnore: [/auth\.setup\.ts/, /intelligence-.*\.spec\.ts/],
      use: { ...TABLET, baseURL: publicURL },
    },

    {
      name: "intelligence",
      testMatch: /intelligence-.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
    },
    {
      name: "intelligence-phone",
      testMatch: /intelligence-.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 5"], storageState: AUTH_FILE },
    },
    {
      name: "intelligence-tablet",
      testMatch: /intelligence-.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...TABLET, storageState: AUTH_FILE },
    },
  ],

  webServer: [
    {
      // `npm.cmd` only exists on Windows, so the suite could not start its own
      // server anywhere else — including CI.
      command: start,
      url: publicURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Emptied rather than deleted: @next/env leaves a variable alone when the
      // process already defines it, so this is what keeps .env.local from
      // putting the demo tenant back.
      env: { DEMO_AUTOLOGIN_EMAIL: "", DEMO_AUTOLOGIN_PASSWORD: "" },
    },
    {
      command: start,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { PORT: "3001" },
    },
  ],
});
