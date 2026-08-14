/**
 * A demo tenant with a login, staff and stores.
 *
 * Everything downstream — the catalogue, the conversations, the records — hangs
 * off this, and several screens are only interesting with more than one person
 * on the floor: frontline performance compares representatives, and a single-rep
 * organization renders a comparison of one.
 *
 * The password is fixed and weak on purpose. This is a demo tenant, marked
 * `test` in the database, and it exists to be logged into from a laptop while
 * someone is watching.
 *
 * Safe to re-run: existing users and rows are reused rather than duplicated.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/demo/seed-account.mts
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const EMAIL = "demo@anuma.co";
const PASSWORD = "password";
const ORGANIZATION = "Nova Electronics";

/** The floor staff. The first is the person who logs in. */
const PEOPLE = [
  { email: EMAIL, name: "Demo Manager", role: "admin" },
  { email: "priya@anuma.co", name: "Priya Nair", role: "representative" },
  { email: "rahul@anuma.co", name: "Rahul Mehta", role: "representative" },
  { email: "aisha@anuma.co", name: "Aisha Khan", role: "representative" },
  { email: "vikram@anuma.co", name: "Vikram Rao", role: "representative" },
];

const STORES = [
  { name: "Indiranagar", code: "BLR-IND" },
  { name: "Koramangala", code: "BLR-KOR" },
  { name: "Whitefield", code: "BLR-WHF" },
];

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);
const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  // The auth user has to exist before a profile or a membership can point at it.
  // Read straight from auth.users rather than paging the admin API: the list
  // endpoint is paginated and a demo account created on an earlier run fell off
  // the first page, so this tried to create it again and failed on the
  // uniqueness of its own previous success.
  const existingUsers = await sql<{ id: string; email: string }[]>`
    select id, email from auth.users where email = any(${PEOPLE.map((p) => p.email)})
  `;
  const byEmail = new Map(existingUsers.map((user) => [user.email, user.id]));

  const userIds = new Map<string, string>();
  for (const person of PEOPLE) {
    const known = byEmail.get(person.email);
    if (known) {
      userIds.set(person.email, known);
      continue;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: person.name },
    });
    if (error) throw new Error(`${person.email}: ${error.message}`);
    userIds.set(person.email, data.user!.id);
  }

  for (const person of PEOPLE) {
    await sql`
      insert into public.user_profiles (user_id, email, display_name)
      values (${userIds.get(person.email)!}, ${person.email}, ${person.name})
      on conflict (user_id) do update set
        email = excluded.email, display_name = excluded.display_name
    `;
  }

  const [existingOrg] = await sql<{ id: string }[]>`
    select id from organizations where name = ${ORGANIZATION} limit 1
  `;
  const [organization] = existingOrg
    ? [existingOrg]
    : await sql<{ id: string }[]>`
        insert into organizations (name, slug, country_code, default_currency, timezone, environment_type)
        values (${ORGANIZATION}, 'nova-electronics', 'IN', 'INR', 'Asia/Kolkata', 'test')
        returning id
      `;

  const memberships = new Map<string, string>();
  for (const person of PEOPLE) {
    const userId = userIds.get(person.email)!;
    const [existing] = await sql<{ id: string }[]>`
      select id from public.organization_memberships
      where organization_id = ${organization!.id} and user_id = ${userId} limit 1
    `;
    const [membership] = existing
      ? [existing]
      : await sql<{ id: string }[]>`
          insert into public.organization_memberships (organization_id, user_id, role, status)
          values (${organization!.id}, ${userId}, ${person.role}, 'active')
          returning id
        `;
    memberships.set(person.email, membership!.id);
  }

  const locations = new Map<string, string>();
  for (const store of STORES) {
    const [existing] = await sql<{ id: string }[]>`
      select id from public.locations
      where organization_id = ${organization!.id} and name = ${store.name} limit 1
    `;
    const [location] = existing
      ? [existing]
      : await sql<{ id: string }[]>`
          insert into public.locations (
            organization_id, name, business_code, location_type, timezone, is_active
          ) values (
            ${organization!.id}, ${store.name}, ${store.code}, 'store', 'Asia/Kolkata', true
          )
          returning id
        `;
    locations.set(store.name, location!.id);
  }

  // Each representative works one store, so per-store comparisons have shape.
  const storeNames = STORES.map((store) => store.name);
  let index = 0;
  for (const person of PEOPLE) {
    const store = storeNames[index % storeNames.length]!;
    index += 1;
    const membershipId = memberships.get(person.email)!;
    const [assigned] = await sql<{ id: string }[]>`
      select id from public.member_assignments
      where organization_id = ${organization!.id} and membership_id = ${membershipId} limit 1
    `;
    if (!assigned) {
      await sql`
        insert into public.member_assignments (
          organization_id, membership_id, location_id, effective_from
        ) values (
          ${organization!.id}, ${membershipId}, ${locations.get(store)!}, now() - interval '120 days'
        )
      `;
    }
  }

  console.log(`organization  ${organization!.id}  (${ORGANIZATION})`);
  console.log(`login         ${EMAIL} / ${PASSWORD}`);
  console.log(`people        ${PEOPLE.length}`);
  console.log(`stores        ${STORES.length}`);
  console.log("\nmemberships:");
  for (const person of PEOPLE) {
    console.log(
      `  ${person.name.padEnd(16)} ${person.role.padEnd(8)} ${memberships.get(person.email)}`,
    );
  }
} finally {
  await sql.end();
}
