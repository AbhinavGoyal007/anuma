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
 * The session comes from tests/auth.setup.ts, which every authenticated project
 * depends on. Nothing here checks whether it is signed in: a suite that skips
 * itself when authentication breaks reports success by not running, which is
 * the one failure mode these tests exist to catch.
 */

/** Escapes a literal for use inside an accessible-name regular expression. */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const INTELLIGENCE_PAGES = [
  "/intelligence/overview",
  "/intelligence/demand",
  "/intelligence/journey",
  "/intelligence/frontline",
] as const;

/**
 * No horizontal scrollbar, at any width, on any page.
 *
 * Names the widest element when it fails: "the page scrolls sideways" sends
 * somebody hunting through a stylesheet, and the answer is almost always one
 * specific box.
 */
async function expectNoHorizontalOverflow(page: Page, where: string) {
  const report = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const widest = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((node) => ({
        selector: `${node.tagName.toLowerCase()}.${String(node.className).split(" ")[0] ?? ""}`,
        right: Math.round(node.getBoundingClientRect().right),
      }))
      .filter((entry) => entry.right > limit + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 3);
    const scrollWidth = document.documentElement.scrollWidth;
    const nav = document.querySelector(".mobile-navigation");
    return {
      overflowing: scrollWidth > limit + 1,
      limit,
      scrollWidth,
      navOverflow: nav ? getComputedStyle(nav).overflowX : "none",
      widest,
    };
  });
  expect(
    report.overflowing,
    `${where} scrolls sideways (viewport ${report.limit}px, document ${report.scrollWidth}px, nav overflow ${report.navOverflow}; widest: ${report.widest
      .map((entry) => `${entry.selector} → ${entry.right}px`)
      .join(", ")})`,
  ).toBe(false);
}

test.describe("Intelligence, signed in", () => {

  test("every page renders its fixed sections", async ({ page }) => {
    const expected: Record<string, string[]> = {
      "/intelligence/overview": [
        "Coverage",
        "Core signals",
        "Priority actions",
        "Trend",
        "Breakdown",
      ],
      "/intelligence/demand": ["Demand mix", "Needs", "Budget", "Clarity", "No-sale blockers"],
      "/intelligence/journey": [
        "Decision path",
        "Business result",
        "Customer state",
        "Diagnosis",
        "Breakdown",
      ],
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
    // The sheet is server-rendered and readable immediately; the dialog
    // behaviour arrives with hydration, which on these pages takes seconds.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const dialog = document.querySelector(".ip-drawer");
            const active = document.activeElement;
            return dialog && active && dialog.contains(active)
              ? "inside"
              : `${active?.tagName ?? "none"}.${String(active?.className ?? "")}`.slice(0, 40);
          }),
        { timeout: 30_000, message: "focus never moved into the sheet" },
      )
      .toBe("inside");
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

  test("the journey rail has four nodes and five fixed diagnosis rows", async ({ page }) => {
    await page.goto("/intelligence/journey?cohort=all");
    await expect(page.locator(".ip-node")).toHaveCount(4);
    await expect(page.locator(".ip-nodes")).not.toContainText(/bought/i);
    // Always these five, always this order, at zero and at non-zero counts.
    const rows = page
      .locator("#jr-diagnosis")
      .locator("xpath=ancestor::section")
      .locator("tbody tr");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("Requirement still unclear");
    await expect(rows.nth(4)).toContainText("Commitment signal + outcome unknown");
  });

  test("coverage opens a drawer whose counts match the rail", async ({ page }) => {
    await page.goto("/intelligence/overview");
    const usable = await page.locator(".ip-coverage-stage").nth(3).locator("strong").innerText();
    await page.locator(".ip-coverage-rail").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 30_000 });
    await expect(drawer).toContainText("Recording");
    await expect(drawer).toContainText("Transcription");
    await expect(drawer).toContainText("Analysis");
    await expect(drawer).toContainText("Intelligence");
    await expect(drawer).toContainText("Trust");
    // The five transcription rows and the five analysis rows always render.
    await expect(drawer.getByText("Cancelled", { exact: true })).toHaveCount(2);
    await expect(
      drawer.locator(".ip-cov-row", { hasText: "Usable" }).first().locator("strong"),
    ).toHaveText(usable);
  });

  test("the trend keeps its six tabs and its default, whatever the data did", async ({ page }) => {
    await page.goto("/intelligence/overview");
    const tabs = page.locator("#ov-trend").locator("xpath=ancestor::section").locator(".ip-tab");
    await expect(tabs).toHaveCount(6);
    await expect(tabs.nth(0)).toHaveText("High-intent arrivals");
    await expect(tabs.nth(0)).toHaveAttribute("aria-current", "true");
  });

  // The tab must change the table, not only its own styling. A control that
  // updated aria-current and left the same rows on screen looked like it worked
  // and answered the same question twice.
  for (const [where, anchor] of [
    ["Overview", "#ov-breakdown"],
    ["Journey", "#jr-breakdown"],
  ] as const) {
    test(`the ${where} breakdown tab changes the table, not just the tab`, async ({ page }) => {
      await page.goto(where === "Overview" ? "/intelligence/overview" : "/intelligence/journey");
      const section = page.locator(anchor).locator("xpath=ancestor::section");
      const tabs = section.locator(".ip-tab");
      await expect(tabs.nth(0)).toHaveText("Stores");
      await expect(tabs.nth(0)).toHaveAttribute("aria-current", "true");

      const stores = section.locator('[data-local-panel="stores"]');
      const categories = section.locator('[data-local-panel="categories"]');
      await expect(stores).toBeVisible();
      await expect(categories).toBeHidden();
      const storeRows = (await stores.locator("tbody th").allTextContents()).join("|");

      await tabs.nth(1).click();
      await expect(categories).toBeVisible({ timeout: 30_000 });
      await expect(stores).toBeHidden();
      await expect(tabs.nth(1)).toHaveAttribute("aria-current", "true");

      const categoryRows = (await categories.locator("tbody th").allTextContents()).join("|");
      // Different first-column labels, so the panel genuinely swapped rather
      // than re-rendering the same grouping under a new heading.
      expect(categoryRows).not.toBe(storeRows);
    });
  }

  test("Q1 shows its unavailable state and offers no dead tabs", async ({ page }) => {
    await page.goto("/intelligence/frontline");
    await expect(page.getByText("Quadrant benchmark not connected")).toBeVisible();
    const q1 = page.locator("section").filter({ has: page.locator("#q1-title") });
    await expect(q1.locator(".ip-tab")).toHaveCount(0);
  });

  test("switching a Needs tab changes the panel without leaving the page", async ({ page }) => {
    await page.goto("/intelligence/demand?need=use_cases");
    await page.locator('[data-local-key="brands"]').click();
    // Instant once hydrated; a full navigation before that, which lands on the
    // same view. Either way the panel ends up showing and the URL says so.
    await expect(page.locator('[data-local-panel="brands"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-local-panel="use_cases"]')).toBeHidden();
    await expect(page).toHaveURL(/need=brands/);
  });

  // A slash splits the route, a colon arrives still escaped, a question mark
  // starts a query and a hash truncates the request. The key travels as one
  // opaque segment so every one of these is just a name again.
  for (const awkward of [
    "iPhone 15/Pro",
    "50% off",
    "A?B",
    "x#y",
    "सोफ़ा सेट",
  ]) {
    test(`a cohort key containing ${JSON.stringify(awkward)} survives the route`, async ({
      page,
    }) => {
      const path = cohortPath(valueCohortKey("final_preferred_product", awkward));
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { name: new RegExp(escapeRegExp(awkward)) })).toBeVisible();
    });
  }

  test("paging through a cohort of more than one page keeps the same cohort", async ({ page }) => {
    // Feeding the already-encoded route segment back into cohortPath() encoded
    // it twice, so Next landed on a cohort key that had never existed. The page
    // holds 25, so this needs a cohort with more than that in it.
    const key = valueCohortKey("language_mix", "English");
    const segment = cohortPath(key).split("/").pop()!;
    await page.goto(`${cohortPath(key)}?days=90`);

    const heading = page.getByRole("heading", { level: 1 }).first();
    const title = await heading.textContent();
    await expect(page.getByText(/Showing 1–25 of \d+/)).toBeVisible();

    // Each of these pages costs a real round trip, so the waits are generous.
    await page.getByRole("link", { name: /Next/ }).first().click();
    await expect(page.getByText(/page 2 of/)).toBeVisible({ timeout: 30_000 });
    await expect(heading).toHaveText(title ?? "");
    // The same cohort, reached by the same opaque segment. Encoding the segment
    // a second time sent Next to a key that had never existed.
    await expect(page).toHaveURL(new RegExp(segment));

    await page.getByRole("link", { name: /Previous/ }).first().click();
    await expect(page.getByText(/Showing 1–25 of \d+/)).toBeVisible({ timeout: 30_000 });
    await expect(heading).toHaveText(title ?? "");
    await expect(page).toHaveURL(new RegExp(segment));
  });

  test("an unavailable store narrows to nothing rather than widening", async ({ page }) => {
    // The failure this replaces: an unknown store id became "all stores", and
    // somebody who asked for one shop was shown the estate.
    await page.goto("/intelligence/overview?store=00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Selected store is unavailable in your scope.")).toBeVisible();
    await expect(page.getByText(/0 usable interactions/)).toBeVisible();
    // And the scope still describes what was asked for: one store, not none.
    await expect(page.getByText(/· 1 store ·/)).toBeVisible();
  });

  test("a salesperson with no interactions narrows to nothing rather than widening", async ({
    page,
  }) => {
    await page.goto("/intelligence/frontline?rep=00000000-0000-0000-0000-000000000000");
    await expect(page.getByText(/0 usable interactions/)).toBeVisible();
  });

  // One test per width rather than one test for twelve page loads: the
  // combined version spent longer loading pages than the default timeout
  // allows, and a timeout on the last page said nothing about the first eleven.
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`every page fits its width at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      for (const path of INTELLIGENCE_PAGES) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page, `${path} at ${size.width}px`);
      }
    });
  }

  test("the first viewport carries each page's answer at 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Coverage leads the Overview by contract, so the first viewport carries
    // Coverage and the Core Signals rather than reaching the Pulse.
    const budget: Record<string, string> = {
      "/intelligence/overview": "#ov-signals",
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
