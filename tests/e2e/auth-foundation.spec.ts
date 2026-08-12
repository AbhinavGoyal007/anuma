import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/conversations",
  "/customer-intelligence",
  "/frontline-performance",
  "/outcome-intelligence",
  "/administration",
];

test("the unauthenticated entry point leads to sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to ANUMA" })).toBeVisible();
});

test("sign-in and sign-up expose real credential forms", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByText("Illustrative interaction")).toBeVisible();
  const needFinding = page.getByRole("button", { name: /Need Gaming \+ College Source turn/ });
  await needFinding.focus();
  await expect(needFinding).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Gaming aur college ke liye laptop chahiye.")).toHaveClass(
    /turn-source-active/,
  );
  const questionFinding = page.getByRole("button", { name: "Question EMI Source turn" });
  await questionFinding.click();
  await expect(page.getByText("EMI kitni padegi?")).toHaveClass(/turn-source-active/);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByText("I’m looking for a laptop for gaming and college.")).toBeVisible();
  const budgetFinding = page.getByRole("button", { name: "Budget ₹80,000 Source turn" });
  await budgetFinding.click();
  await expect(page.getByText("My budget is around ₹80,000.")).toHaveClass(/turn-source-active/);
  await page.getByRole("button", { name: "Tamil + English" }).click();
  await expect(page.getByText("Gaming-um college-um use panna laptop venum.")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();

  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

for (const route of protectedRoutes) {
  test(`unauthenticated users are redirected from ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in$/);
  });
}
