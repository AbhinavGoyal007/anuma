/**
 * A showroom conversation at a real dealership, against that dealership's real
 * stock.
 *
 * Only the conversation is invented. Everything it refers to is in the Delaware
 * feed: Boulevard Ford had nineteen hybrids on the lot, two of them Escape PHEVs
 * at $33,248 and $33,253, and a range of gas Escapes around thirty thousand.
 *
 * The scenario is a customer who wants a hybrid SUV around thirty-five thousand
 * and is told the hybrids start higher than that. Two were under his budget,
 * parked outside. Nothing here is exaggerated — those are the feed's own prices.
 *
 * Stock comes from the feed as well: one row is one vehicle, so a VIN present is
 * a unit on the lot. The feed's `onlot` column is 1 on all 726 rows and
 * distinguishes nothing.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/make-ford-scenario.mts --org "Delaware Auto Group"
 */

import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "Delaware Auto Group" },
    stock: { type: "string", default: "eval/ford/stock.csv" },
    out: { type: "string", default: "eval/ford/conversation.json" },
    title: { type: "string", default: "Boulevard Ford walk-in — hybrid SUV" },
  },
});

/** R is the salesperson, C the customer. */
const DIALOGUE: [speaker: "R" | "C", line: string][] = [
  ["R", "Morning, welcome to Boulevard Ford. Anything I can help you find today?"],
  ["C", "Yeah, we're looking to replace my wife's car. Something bigger, an SUV."],
  ["R", "Sure. What's it mainly going to be used for?"],
  ["C", "School runs, groceries, and we drive down to Rehoboth most weekends in summer."],
  ["R", "Got it. How many in the family?"],
  ["C", "Two kids, both in car seats still, so back seat space matters."],
  ["R", "Understood. And what were you thinking budget-wise?"],
  ["C", "We'd like to stay around thirty-five thousand. Forty is really the ceiling."],
  ["R", "That's workable. Any preference on the powertrain?"],
  [
    "C",
    "I'd really like a hybrid. Gas is killing us, I'm doing about eighteen thousand miles a year.",
  ],
  ["R", "Okay. Let me show you the Escape, it's our most popular SUV."],
  ["C", "Is this one a hybrid?"],
  ["R", "This particular one is the gas model. Twenty-eight seven."],
  ["C", "What about the hybrid version?"],
  ["R", "The hybrids run higher. You're looking at closer to thirty-eight, forty for those."],
  ["C", "That's above where we wanted to be."],
  ["R", "Right. The gas Escape gives you the same space, and it's a good bit cheaper up front."],
  ["C", "But then I'm paying it back at the pump. That's the whole reason I want a hybrid."],
  ["R", "I hear you. We do get hybrids in, they just move quickly."],
  ["C", "Do you have anything hybrid on the lot right now under forty?"],
  ["R", "Not really in the SUV range at that number today."],
  ["C", "Hmm. Okay."],
  ["R", "I can take your details and call you when one comes in?"],
  [
    "C",
    "Sure. Honestly I might check the Honda dealer in Newark too, my brother got a CR-V there.",
  ],
  ["R", "Of course. Would you like to drive the gas Escape while you're here?"],
  ["C", "Not today, I think. If it's not a hybrid it's not really what we came for."],
  ["R", "Understood. Let me get your number."],
  ["C", "Thanks."],
];

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);
  const [membership] = await sql<{ id: string }[]>`
    select id from organization_memberships where organization_id = ${organization.id} limit 1
  `;
  const [location] = await sql<{ id: string }[]>`
    select id from locations where organization_id = ${organization.id} limit 1
  `;
  if (!membership) throw new Error("No membership for this organization.");

  let clock = 0;
  const entries = DIALOGUE.map(([speaker, line]) => {
    const start = clock;
    const seconds = Math.max(2.5, Math.min(9, line.length / 14));
    clock += seconds + 0.4;
    return {
      transcript: line,
      start_time_seconds: Number(start.toFixed(2)),
      end_time_seconds: Number((start + seconds).toFixed(2)),
      speaker_id: speaker === "R" ? "SPEAKER_00" : "SPEAKER_01",
    };
  });

  mkdirSync("eval/ford", { recursive: true });
  writeFileSync(
    values.out!,
    `${JSON.stringify(
      { title: values.title!, language_code: "en-US", diarized_transcript: { entries } },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const [existing] = await sql<{ id: string }[]>`
    select id from conversations
    where organization_id = ${organization.id} and title = ${values.title!} limit 1
  `;
  const conversationId = existing?.id ?? randomUUID();
  if (!existing) {
    await sql`
      insert into conversations (
        id, organization_id, created_by_membership_id, representative_membership_id,
        location_id, vertical, started_at, lifecycle_status, title
      ) values (
        ${conversationId}, ${organization.id}, ${membership.id}, ${membership.id},
        ${location?.id ?? null}, 'automotive', now(), 'ready', ${values.title!}
      )
    `;
  }

  const [recorded] = await sql<{ id: string }[]>`
    select id from recordings where conversation_id = ${conversationId} limit 1
  `;
  if (!recorded) {
    const recordingId = randomUUID();
    await sql`
      insert into recordings (
        id, organization_id, conversation_id, storage_bucket, storage_object_path,
        mime_type, file_size_bytes, duration_milliseconds, status,
        created_by_membership_id, capture_source, finalized_at
      ) values (
        ${recordingId}, ${organization.id}, ${conversationId}, 'conversation-audio',
        ${`${organization.id}/${conversationId}/${recordingId}/source.wav`},
        'audio/wav', 0, ${Math.round(clock * 1000)}, 'uploaded',
        ${membership.id}, 'browser_recording', now()
      )
    `;
  }

  // Straight from the feed: a VIN in the file is a vehicle on the lot.
  const stockRows = readFileSync(values.stock!, "utf8").trim().split("\n").slice(1);
  await sql`delete from inventory where organization_id = ${organization.id}`;
  const rows = stockRows.map((line) => {
    const [itemId, stock] = line.split(",");
    return {
      organization_id: organization.id,
      item_id: itemId!,
      location_id: location?.id ?? null,
      stock: Number(stock ?? 1),
      as_of: new Date().toISOString(),
    };
  });
  for (let index = 0; index < rows.length; index += 500) {
    await sql`insert into inventory ${sql(rows.slice(index, index + 500))}`;
  }

  console.log(`conversation  ${conversationId}`);
  console.log(`transcript    ${values.out} (${entries.length} turns)`);
  console.log(`inventory     ${rows.length} vehicles on the lot`);
} finally {
  await sql.end();
}
