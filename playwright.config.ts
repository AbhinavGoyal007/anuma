import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "android-phone",
      use: {
        ...devices["Pixel 5"],
      },
    },
    {
      name: "android-tablet",
      use: {
        browserName: "chromium",
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 768, height: 1024 },
      },
    },
  ],
  webServer: {
    command: "npm.cmd run start",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
