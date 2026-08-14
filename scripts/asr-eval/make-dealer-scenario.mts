/**
 * A showroom conversation, and what was on the floor that day.
 *
 * The dialogue is written the way these actually happen in a Bengaluru
 * showroom — Hinglish, the customer switching to English for the model names
 * and back to Hindi for everything else — because a transcript that is tidier
 * than reality tests nothing. It is written in the diarized shape the worker
 * emits so the rest of the run uses the same path a real recording would; only
 * the transcription and diarization steps are skipped, and those were measured
 * separately.
 *
 * The scenario is the one worth catching. A customer wants a 650 for highway
 * touring with a pillion. The salesperson shows the Interceptor, the customer
 * says it is not comfortable enough for long rides, and the salesperson tells
 * him the 650 range is only the Interceptor and the GT — so he leaves. The
 * dealer had four other 650s on the floor that morning, one of them the Super
 * Meteor, which is the touring bike in the range and the answer to what he
 * asked for.
 *
 * Nothing about the shape of that is specific to motorcycles: a wrong "we do
 * not have it", and a range shown far narrower than the one in stock.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/make-dealer-scenario.mts --org "Torque Motors"
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "Torque Motors" },
    out: { type: "string", default: "eval/dealer/conversation.json" },
  },
});

/** R is the representative, C the customer. */
const DIALOGUE: [speaker: "R" | "C", line: string][] = [
  ["R", "Namaste sir, welcome to Torque Motors. Kya dekh rahe the aap?"],
  ["C", "Ek Royal Enfield leni hai. Highway riding ke liye, mostly long rides."],
  ["R", "Bahut badhiya sir. Kitne kilometre ka riding hota hai monthly?"],
  ["C", "Har weekend Bangalore se Coorg ya Chikmagalur. Do sau se teen sau kilometre one way."],
  ["R", "Solo ride karte hain ya pillion ke saath?"],
  ["C", "Zyada tar wife ke saath. Woh peeche baithti hai, toh uska comfort important hai."],
  ["R", "Samajh gaya sir. Budget kya soch rahe hain?"],
  ["C", "Around three lakh fifty. Agar bike sahi hui toh three seventy tak jaa sakta hoon, on-road."],
  ["R", "Theek hai. Engine mein kya preference hai?"],
  ["C", "650 chahiye. 350 pe highway pe vibration bahut aata hai, maine friend ki Classic chalayi hai."],
  ["R", "Bilkul sahi. Toh main aapko Interceptor 650 dikhata hoon. Canyon Red mein available hai."],
  ["C", "Haan ye dekhi hai maine online. Seat kaisi hai long ride ke liye?"],
  ["R", "Interceptor roadster hai sir, seating slightly forward-leaning hai."],
  ["C", "Yehi problem hai. Do sau kilometre ke baad kamar dard ho jaata hai aise posture mein."],
  ["R", "Haan wo hai. Ismein touring seat accessory laga sakte hain."],
  ["C", "Aur wind protection? Highway pe seedha hawa lagti hai chest pe."],
  ["R", "Windscreen accessory available hai sir, alag se lagana padega."],
  ["C", "Matlab base bike touring ke liye nahi hai, accessories daalke banani padegi."],
  ["R", "Kuch had tak, haan."],
  ["C", "Koi aur 650 hai jo directly touring ke liye bani ho? Cruiser type, jismein aaram se baith sakein?"],
  ["R", "650 mein humare paas bas Interceptor aur Continental GT hai sir. GT toh aur bhi sporty hai, cafe racer."],
  ["C", "Toh kuch nahi hai mere liye?"],
  ["R", "Filhaal 650 mein yahi do hain. Aap 350 Meteor dekh lijiye, cruiser hai, comfortable hai."],
  ["C", "Nahi, 350 nahi chahiye. Vibration ka issue hai highway pe, wahi to problem hai."],
  ["R", "Samajh raha hoon sir."],
  ["C", "Theek hai, main phir doosri jagah dekh leta hoon. Ya online check karta hoon."],
  ["R", "Sir aap Interceptor pe test ride le lijiye, shayad pasand aa jaaye."],
  ["C", "Nahi abhi nahi. Mujhe touring bike chahiye thi seedhi, modify karke nahi."],
  ["R", "Theek hai sir. Mera number save kar lijiye, kuch aaye toh bataunga."],
  ["C", "Haan theek hai. Thank you."],
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
  if (!membership) throw new Error("The dealer has no membership.");

  // The transcript, in the shape the worker emits. Roughly four seconds a turn.
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

  mkdirSync("eval/dealer", { recursive: true });
  writeFileSync(
    values.out!,
    `${JSON.stringify(
      {
        // The rebuild path matches a transcript to its conversation by title.
        title: "Showroom walk-in — 650 touring",
        language_code: "hi-IN",
        diarized_transcript: { entries },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const [existing] = await sql<{ id: string }[]>`
    select id from conversations
    where organization_id = ${organization.id} and title = 'Showroom walk-in — 650 touring'
    limit 1
  `;
  const conversationId = existing?.id ?? randomUUID();
  if (!existing) {
    await sql`
      insert into conversations (
        id, organization_id, created_by_membership_id, representative_membership_id,
        location_id, vertical, started_at, lifecycle_status, title
      ) values (
        ${conversationId}, ${organization.id}, ${membership.id}, ${membership.id},
        ${location?.id ?? null}, 'automotive', now(), 'ready',
        'Showroom walk-in — 650 touring'
      )
    `;
  }

  // The recording the transcript belongs to. No audio file is uploaded — the
  // transcription and diarization steps are the ones being skipped here — but
  // the row has to exist, because every downstream step reads a conversation
  // through its recording rather than on its own.
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

  // What was on the floor that morning. The four 650s the customer was never
  // shown are all in stock; the Interceptor he was shown is too.
  const items = await sql<{ item_id: string; description: string; subgroup_name: string }[]>`
    select item_id, description, subgroup_name from catalogue_items
    where organization_id = ${organization.id} and valid_to is null
  `;
  const stockOf = (description: string): number => {
    if (/Interceptor 650/.test(description)) return 3;
    if (/Super Meteor 650/.test(description)) return 2;
    if (/Shotgun 650/.test(description)) return 1;
    if (/Bear 650/.test(description)) return 2;
    if (/Classic 650/.test(description)) return 1;
    if (/Continental GT 650/.test(description)) return 1;
    // The 350s and the adventure bikes are on the floor in the usual numbers;
    // gear and spares are stocked deep. Some colours are simply out.
    if (/Motorcycle|Royal Enfield (Hunter|Bullet|Classic 350|Meteor|Goan|Scram|Himalayan|Guerrilla)/.test(description)) {
      return description.length % 3 === 0 ? 0 : 2;
    }
    return description.length % 5;
  };

  await sql`delete from inventory where organization_id = ${organization.id}`;
  const rows = items.map((item) => ({
    organization_id: organization.id,
    item_id: item.item_id,
    location_id: location?.id ?? null,
    stock: stockOf(item.description),
    as_of: new Date().toISOString(),
  }));
  for (let index = 0; index < rows.length; index += 500) {
    await sql`insert into inventory ${sql(rows.slice(index, index + 500))}`;
  }

  const inStock650 = items.filter(
    (item) => item.subgroup_name === "650cc Twin" && stockOf(item.description) > 0,
  );
  console.log(`conversation  ${conversationId}`);
  console.log(`transcript    ${values.out} (${entries.length} turns)`);
  console.log(`inventory     ${rows.length} rows, ${rows.filter((r) => r.stock > 0).length} in stock`);
  console.log(`650cc twins on the floor: ${inStock650.length}`);
  for (const item of inStock650.slice(0, 8)) console.log(`   ${item.description}`);
} finally {
  await sql.end();
}
