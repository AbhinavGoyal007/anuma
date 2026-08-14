/**
 * Standing up a motorcycle dealer as a new client.
 *
 * Deliberately minimal: an organization, a showroom, and a membership for the
 * salesperson, reusing the existing operator's user so no auth account has to be
 * provisioned for a test. Everything after this — the catalogue load, attribute
 * discovery, the conversation, the record — runs the same code the electronics
 * client runs, which is the point of the exercise.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/setup-dealer-org.mts --name "Torque Motors"
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "Torque Motors" },
    slug: { type: "string", default: "torque-motors" },
  },
});

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [existing] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.name!} limit 1
  `;
  if (existing) {
    console.log(`${values.name} already exists (${existing.id}).`);
  }

  const [organization] = existing
    ? [existing]
    : await sql<{ id: string }[]>`
        insert into organizations (name, slug, country_code, default_currency, timezone, environment_type)
        values (${values.name!}, ${values.slug!}, 'IN', 'INR', 'Asia/Kolkata', 'test')
        returning id
      `;

  const [location] = await sql<{ id: string }[]>`
    insert into locations (organization_id, name, location_type, timezone, is_active)
    values (${organization!.id}, 'Indiranagar Showroom', 'store', 'Asia/Kolkata', true)
    on conflict do nothing
    returning id
  `;

  // Reuse whichever user already operates the electronics client, so the dealer
  // is browsable without inventing an auth identity.
  const [operator] = await sql<{ user_id: string }[]>`
    select user_id from organization_memberships order by created_at limit 1
  `;
  if (!operator) throw new Error("No existing membership to copy a user from.");

  const [membership] = await sql<{ id: string }[]>`
    insert into organization_memberships (organization_id, user_id, role, status)
    values (${organization!.id}, ${operator.user_id}, 'admin', 'active')
    on conflict do nothing
    returning id
  `;

  const [resolvedMembership] = membership
    ? [membership]
    : await sql<{ id: string }[]>`
        select id from organization_memberships
        where organization_id = ${organization!.id} limit 1
      `;

  const [resolvedLocation] = location
    ? [location]
    : await sql<{ id: string }[]>`
        select id from locations where organization_id = ${organization!.id} limit 1
      `;

  console.log(`organization  ${organization!.id}`);
  console.log(`location      ${resolvedLocation?.id ?? "none"}`);
  console.log(`membership    ${resolvedMembership?.id ?? "none"}`);
} finally {
  await sql.end();
}
