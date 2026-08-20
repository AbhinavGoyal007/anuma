import { expect, test as setup } from "@playwright/test";

/**
 * A real session, or a failing suite.
 *
 * The Intelligence tests used to check whether they had landed on /sign-in and
 * call `test.skip` if they had. That turns the most important suite in the
 * repository into one that reports success by not running: a broken proxy, an
 * expired demo tenant or a missing environment variable all produced a green
 * tick and zero executed assertions.
 *
 * So authentication happens once, here, and every authenticated project depends
 * on it. If a session cannot be established this step fails, and the projects
 * that need it never run — which is the honest outcome, and a visible one.
 *
 * This deployment signs an anonymous visitor into the synthetic demo tenant
 * (src/lib/supabase/proxy.ts), so arriving is normally enough. Where it is not,
 * credentials come from the environment and are never committed.
 */

export const AUTH_FILE = "playwright/.auth/manager.json";

setup("a manager session exists", async ({ page }) => {
  await page.goto("/intelligence/overview");

  if (/\/sign-in/.test(page.url())) {
    const email = process.env.E2E_EMAIL ?? process.env.DEMO_AUTOLOGIN_EMAIL;
    const password = process.env.E2E_PASSWORD ?? process.env.DEMO_AUTOLOGIN_PASSWORD;
    if (!email || !password) {
      throw new Error(
        "No Intelligence session could be established. The demo autologin did not sign this " +
          "visitor in, and neither E2E_EMAIL/E2E_PASSWORD nor DEMO_AUTOLOGIN_EMAIL/" +
          "DEMO_AUTOLOGIN_PASSWORD is set. Set them, or fix the demo tenant — the " +
          "authenticated suite must not be skipped.",
      );
    }
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(intelligence|conversations|setup)/, { timeout: 30_000 });
    await page.goto("/intelligence/overview");
  }

  await expect(page).toHaveURL(/\/intelligence\/overview/);
  // Proof of a real tenant, not just a route that failed to redirect.
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
