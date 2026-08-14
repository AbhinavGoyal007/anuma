/**
 * Putting the generated conversations into the database.
 *
 * Spread across the floor staff, the stores and roughly three months, because
 * every comparison screen in the product is a comparison of those three things.
 * All sixty landing on one representative on one afternoon would render as a
 * single bar and prove nothing.
 *
 * Recordings carry no audio. The transcription and diarization steps are the
 * ones being skipped; everything after them runs for real.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/demo/seed-conversations.mts --org "Nova Electronics" --dir eval/demo
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "Nova Electronics" },
    dir: { type: "string", default: "eval/demo" },
  },
});

/** Deterministic, matching the generator, so re-runs are identical. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const random = makeRandom(77001);

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const staff = await sql<{ id: string; role: string; display_name: string }[]>`
    select m.id, m.role::text as role, coalesce(p.display_name, p.email) as display_name
    from public.organization_memberships as m
    join public.user_profiles as p on p.user_id = m.user_id
    where m.organization_id = ${organization.id}
    order by m.created_at
  `;
  const admin = staff.find((person) => person.role === "admin") ?? staff[0]!;
  const reps = staff.filter((person) => person.role === "representative");
  if (reps.length === 0) throw new Error("No representatives to attribute conversations to.");

  const locations = await sql<{ id: string; membership_id: string | null }[]>`
    select l.id, a.membership_id
    from public.locations as l
    left join public.member_assignments as a on a.location_id = l.id
    where l.organization_id = ${organization.id}
  `;
  const locationByMembership = new Map(
    locations.filter((row) => row.membership_id).map((row) => [row.membership_id!, row.id]),
  );

  const manifest: { file: string; title: string }[] = JSON.parse(
    readFileSync(`${values.dir}/manifest.json`, "utf8"),
  );

  let created = 0;
  let skipped = 0;

  for (const [index, entry] of manifest.entries()) {
    const [existing] = await sql<{ id: string }[]>`
      select id from public.conversations
      where organization_id = ${organization.id} and title = ${entry.title} limit 1
    `;
    if (existing) {
      skipped += 1;
      continue;
    }

    const rep = reps[index % reps.length]!;
    // Weekday-ish and spread over about ninety days, with recent weeks denser so
    // a trend line has a near end to it.
    const daysAgo = Math.round(Math.pow(random(), 1.4) * 88) + 1;
    const hour = 10 + Math.floor(random() * 9);
    const minute = Math.floor(random() * 60);
    const startedAt = new Date();
    startedAt.setDate(startedAt.getDate() - daysAgo);
    startedAt.setHours(hour, minute, 0, 0);

    const payload = JSON.parse(readFileSync(`${values.dir}/${entry.file}`, "utf8"));
    const lastEntry = payload.diarized_transcript.entries.at(-1);
    const durationMs = Math.round((lastEntry?.end_time_seconds ?? 300) * 1000);
    const endedAt = new Date(startedAt.getTime() + durationMs);

    const conversationId = randomUUID();
    await sql`
      insert into public.conversations (
        id, organization_id, created_by_membership_id, representative_membership_id,
        location_id, vertical, started_at, ended_at, lifecycle_status, title
      ) values (
        ${conversationId}, ${organization.id}, ${admin.id}, ${rep.id},
        ${locationByMembership.get(rep.id) ?? null}, 'electronics',
        ${startedAt.toISOString()}, ${endedAt.toISOString()}, 'ready', ${entry.title}
      )
    `;

    const recordingId = randomUUID();
    await sql`
      insert into public.recordings (
        id, organization_id, conversation_id, storage_bucket, storage_object_path,
        mime_type, file_size_bytes, duration_milliseconds, status,
        created_by_membership_id, capture_source, finalized_at
      ) values (
        ${recordingId}, ${organization.id}, ${conversationId}, 'conversation-audio',
        ${`${organization.id}/${conversationId}/${recordingId}/source.wav`},
        'audio/wav', 0, ${durationMs}, 'uploaded',
        ${rep.id}, 'browser_recording', ${endedAt.toISOString()}
      )
    `;
    created += 1;
  }

  const spread = await sql<{ display_name: string; conversations: number }[]>`
    select coalesce(p.display_name, p.email) as display_name, count(*)::int as conversations
    from public.conversations as c
    join public.organization_memberships as m on m.id = c.representative_membership_id
    join public.user_profiles as p on p.user_id = m.user_id
    where c.organization_id = ${organization.id}
    group by 1 order by 2 desc
  `;

  console.log(`${created} conversation(s) created, ${skipped} already present.\n`);
  for (const row of spread) {
    console.log(`  ${row.display_name.padEnd(16)} ${row.conversations}`);
  }
} finally {
  await sql.end();
}
