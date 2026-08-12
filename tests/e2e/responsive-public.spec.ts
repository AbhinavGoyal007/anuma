import { expect, test } from "@playwright/test";

const viewports = [
  { name: "360 × 800 phone", width: 360, height: 800 },
  { name: "390 × 844 phone", width: 390, height: 844 },
  { name: "412 × 915 phone", width: 412, height: 915 },
  { name: "600 × 960 tablet", width: 600, height: 960 },
  { name: "768 × 1024 tablet", width: 768, height: 1024 },
  { name: "800 × 1280 tablet", width: 800, height: 1280 },
  { name: "1024 × 768 landscape tablet", width: 1024, height: 768 },
  { name: "1440 × 900 desktop", width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`sign-in remains usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Sign in to ANUMA" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(
      await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  });
}
