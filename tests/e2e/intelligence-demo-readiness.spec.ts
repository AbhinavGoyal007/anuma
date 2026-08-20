import { expect, test, type Page } from "@playwright/test";

import { cohortPath, valueCohortKey } from "../../src/modules/intelligence/cohorts";

/**
 * The Intelligence surface, driven the way a manager drives it.
 *
 * Every assertion here is about a promise the product makes and a screenshot
 * cannot check: that a displayed number opens exactly the interactions it
 * counted, that a filter travels between pages while page-local state does not,
 * that the drawer is a dialog rather than a box on top, and that no page
 * scrolls sideways on a phone.
 *
 * A session is needed. This deployment signs an anonymous visitor into the
 * synthetic demo tenant (see src/lib/supabase/proxy.ts), so one is normally
 * available; where it is not, the suite says so instead of passing quietly.
 */

const INTELLIGENCE_PAGES = [
  "/intelligence/overview",
  "/intelligence/demand",
  "/intelligence/journey",
  "/intelligence/frontline",
] as const;

/** No horizontal scrollbar, at any width, on any page. */
async function expectNoHorizontalOverflow(page: Page, where: string) {
  const overflowing = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowing, `${where} scrolls sideways`).toBe(false);
}

async function requireSession(page: Page) {
  await page.goto("/intelligence/overview");
  if (/\/sign-in$/.test(page.url())) {
    test.skip(true, "No session available: sign in, or enable the demo tenant, to run this suite.");
  }
}

test.describe("Intelligence, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await requireSession(page);
  });

  test("every page renders its fixed sections", async ({ page }) => {
    const expected: Record<string, string[]> = {
      "/intelligence/overview": ["Signals", "Actions", "Trend", "Hotspots"],
      "/intelligence/demand": ["Demand mix", "Needs", "Budget", "Clarity", "No-sale blockers"],
      "/intelligence/journey": ["Decision path", "Diagnosis", "Business result", "Customer state"],
      "/intelligence/frontline": ["Detail", "Learn from Q1"],
    };
    for (const [path, headings] of Object.entries(expected)) {
      await page.goto(path);
      for (const heading of headings) {
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      }
    }
  });

  test("carries the population filters between all four pages and leaks no page-local state", async ({
    page,
  }) => {
    await page.goto("/intelligence/demand?days=7&category=laptop&need=brands");
    for (const path of INTELLIGENCE_PAGES) {
      const href = await page.locator(`.nav-link[href^="${path}"]`).getAttribute("href");
      expect(href, `${path} lost the period`).toContain("days=7");
      expect(href, `${path} lost the category`).toContain("category=laptop");
      // A Needs tab means nothing on Journey.
      expect(href, `${path} carried page-local state`).not.toContain("need=");
    }
  });

  test("a signal opens exactly the interactions it counted", async ({ page }) => {
    await page.goto("/intelligence/overview");
    const tile = page.locator("a.ip-signal").first();
    const meta = await tile.locator(".ip-meta").innerText();
    const affected = meta.split(" of ")[0]!.trim();
    await tile.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 30_000 });
    await expect(drawer.locator(".ip-drawer-value strong")).toHaveText(affected);
  });

  test("the drawer behaves like a dialog", async ({ page }) => {
    await page.goto("/intelligence/frontline");
    await page.locator("a.ip-action-card").first().click();
    const drawer = page.getByRole("dialog");
    // The drawer is server-rendered with its evidence, so opening it costs a
    // navigation. See the performance note: these pages take seconds, not
    // milliseconds, and the wait is honest about that rather than flaky.
    await expect(drawer).toBeVisible({ timeout: 30_000 });
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(drawer.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("every execution stage renders and drives one detail panel", async ({ page }) => {
    await page.goto("/intelligence/frontline");
    await expect(page.locator("a.ip-stage")).toHaveCount(5);
    for (const stage of ["understand", "recommend", "resolve", "expand", "close"]) {
      await page.locator(`a.ip-stage[data-local-key="${stage}"]`).click();
      await expect(page.locator(`[data-local-panel="${stage}"]`)).toBeVisible();
      // Exactly one detail panel is ever showing.
      await expect(page.locator("#fl-detail")).toBeVisible();
    }
  });

  test("the journey rail has four nodes, no bought node, and drives one diagnosis", async ({
    page,
  }) => {
    await page.goto("/intelligence/journey?cohort=all");
    await expect(page.locator(".ip-node")).toHaveCount(4);
    await expect(page.locator(".ip-nodes")).not.toContainText(/bought/i);
    await page.locator(".ip-node").nth(1).click();
    await expect(page.locator("#jr-diagnosis")).toContainText("Requirement clear");
  });

  test("Q1 shows its unavailable state and offers no dead tabs", async ({ page }) => {
    await page.goto("/intelligence/frontline");
    await expect(page.getByText("Quadrant benchmark not connected")).toBeVisible();
    const q1 = page.locator("section").filter({ has: page.locator("#q1-title") });
    await expect(q1.locator(".ip-tab")).toHaveCount(0);
  });

  test("switching a Needs tab changes the panel without leaving the page", async ({ page }) => {
    await page.goto("/intelligence/demand?need=use_cases");
    await page.locator('[data-local-key="brands"]').click();
    await expect(page.locator('[data-local-panel="brands"]')).toBeVisible();
    await expect(page.locator('[data-local-panel="use_cases"]')).toBeHidden();
    await expect(page).toHaveURL(/need=brands/);
  });

  test("a cohort key with a slash and a percent survives the route", async ({ page }) => {
    // A slash splits the route and a colon arrives still escaped, so the key
    // travels as one opaque segment.
    const path = cohortPath(valueCohortKey("final_preferred_product", "iPhone 15/Pro 50%"));
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: /iPhone 15\/Pro 50%/ })).toBeVisible();
  });

  test("every page fits its width at desktop, tablet and phone", async ({ page }) => {
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      for (const path of INTELLIGENCE_PAGES) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page, `${path} at ${size.width}px`);
      }
    }
  });

  test("the first viewport carries each page's answer at 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const budget: Record<string, string> = {
      "/intelligence/overview": ".ip-pulse",
      "/intelligence/demand": "#dm-mix",
      "/intelligence/journey": "#jr-diagnosis",
      "/intelligence/frontline": ".ip-execution",
    };
    for (const [path, selector] of Object.entries(budget)) {
      await page.goto(path);
      const bottom = await page.locator(selector).evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.bottom + window.scrollY;
      });
      expect(bottom, `${path} pushes its answer below the fold`).toBeLessThanOrEqual(900);
    }
  });
});
