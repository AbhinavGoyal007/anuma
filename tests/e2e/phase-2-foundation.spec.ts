import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

const verificationId = crypto.randomUUID().slice(0, 8);
const email = `phase2.verify.${verificationId}@gmail.com`;
const password = `Anuma-${crypto.randomUUID()}!`;
const organizationName = `ANUMA Phase 2 Verification ${verificationId}`;
const locationName = `Verification Showroom ${verificationId}`;
const teamName = `Verification Team ${verificationId}`;

test.afterAll(async () => {
  process.loadEnvFile(".env.local");
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) return;

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const users = await sql<{ id: string }[]>`select id from auth.users where email = ${email}`;
    for (const user of users) {
      const memberships = await sql<{ organization_id: string }[]>`
        select organization_id
        from public.organization_memberships
        where user_id = ${user.id}::uuid
      `;
      for (const membership of memberships) {
        await sql`
          delete from public.conversations
          where organization_id = ${membership.organization_id}::uuid
        `;
        await sql`
          delete from public.organizations
          where id = ${membership.organization_id}::uuid
        `;
      }
      await sql`delete from auth.users where id = ${user.id}::uuid`;
    }
  } finally {
    await sql.end();
  }
});

async function createDevelopmentAccount() {
  process.loadEnvFile(".env.local");
  const databaseUrl = process.env.SUPABASE_DB_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!databaseUrl || !url || !secret) {
    throw new Error(
      "SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SECRET_KEY are required for browser verification.",
    );
  }

  const { data, error } = await createSupabaseClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin.createUser({ email, email_confirm: true, password });
  if (error || !data.user)
    throw new Error(`Browser test user could not be created: ${error?.message}`);
}

test("a new workspace can be created, used and signed out of", async ({ page }) => {
  // Twelve real round trips against a remote database, on three device
  // projects at once. Sixty seconds fitted when the suite ran one server; it
  // does not now, and a timeout part-way through reads as a broken form.
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await createDevelopmentAccount();
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/setup$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Set up your ANUMA workspace" })).toBeVisible();
  await page.getByLabel("Organization name").fill(organizationName);
  await page.getByLabel("Country").selectOption("IN");
  await page.getByLabel("Default currency").selectOption("INR");
  await page.getByLabel("Display timezone").selectOption("Asia/Kolkata");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page).toHaveURL(/\/administration\?created=organization$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: organizationName, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill(locationName);
  await page.getByLabel("Type").selectOption("showroom");
  await page.getByRole("button", { name: "Add location" }).click();
  // Each of these waits on a write to a remote database, with the same journey
  // running on three device projects at once. The default five seconds made the
  // suite pass or fail on how busy the machine was.
  await expect(page.getByText(locationName, { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Team name").fill(teamName);
  await page.getByRole("button", { name: "Add team" }).click();
  await expect(page.getByText(teamName, { exact: true })).toBeVisible({ timeout: 30_000 });

  // Interactions are recorded on the Anuma app, not typed into a form here, so
  // a new workspace's Conversations page is its empty state. The form this test
  // used to fill was removed from the product; asserting it still existed made
  // the suite fail for a UI nobody had shipped in months.
  await page.getByRole("link", { name: "Conversations" }).first().click();
  await expect(page.getByRole("heading", { name: "Conversations", exact: true })).toBeVisible();
  await expect(page.getByText("No interactions yet")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Conversations recorded in your stores will appear here/ }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("No interactions yet")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Primary navigation on small screens" }),
  ).toBeVisible();

  await page.getByLabel("Open user menu").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/administration");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect({ consoleErrors, failedResponses }).toEqual({ consoleErrors: [], failedResponses: [] });
});
