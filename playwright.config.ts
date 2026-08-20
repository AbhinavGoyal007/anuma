import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";

/** Written by tests/auth.setup.ts, gitignored, never committed. */
const AUTH_FILE = "playwright/.auth/manager.json";

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
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "public-phone",
      testIgnore: [/auth\.setup\.ts/, /intelligence-.*\.spec\.ts/],
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "public-tablet",
      testIgnore: [/auth\.setup\.ts/, /intelligence-.*\.spec\.ts/],
      use: { ...TABLET },
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

  webServer: {
    // `npm.cmd` only exists on Windows, so the suite could not start its own
    // server anywhere else — including CI.
    command: process.platform === "win32" ? "npm.cmd run start" : "npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
