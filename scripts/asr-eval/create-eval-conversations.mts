/**
 * Creating conversations for the test-pack scripts that were never uploaded.
 *
 * Four of the fourteen scripts were recorded through the product and exist as
 * real conversations. The other nine were recorded as voice notes and have never
 * been in the database, which is why the end-to-end comparison could only cover
 * four.
 *
 * Rather than fabricate rows, this uploads each recording to the same private
 * bucket the product uses and creates the conversation and recording it would
 * have created — same organization, same representative, same location, same
 * storage layout. Everything downstream then behaves exactly as it would for a
 * real capture, including playback and the signed URLs the evidence path uses.
 *
 * Existing conversations are left alone; the script is safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/create-eval-conversations.mts --audio eval/audio2 --org "AG LLC"
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const { values } = parseArgs({
  options: {
    audio: { type: "string", default: "eval/audio2" },
    org: { type: "string", default: "AG LLC" },
  },
});

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });
const storage = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

type Manifest = { recordings: { file: string; title: string; durationMs: number }[] };

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  // Copied from an existing scripted conversation so the new ones sit in the
  // same store, under the same representative, and appear in the same
  // dashboards. A conversation with no location would quietly drop out of every
  // per-store comparison.
  const [template] = await sql<
    {
      created_by_membership_id: string;
      representative_membership_id: string;
      location_id: string | null;
      vertical: string;
    }[]
  >`
    select created_by_membership_id, representative_membership_id, location_id, vertical
    from conversations
    where organization_id = ${organization.id} and title like 'Script%'
    order by created_at limit 1
  `;
  if (!template) throw new Error("No existing scripted conversation to copy settings from.");

  const manifest: Manifest = JSON.parse(
    await readFile(join(values.audio!, "manifest.json"), "utf8"),
  );

  let created = 0;
  for (const record of manifest.recordings) {
    const [existing] = await sql<{ id: string }[]>`
      select id from conversations
      where organization_id = ${organization.id} and title = ${record.title}
      limit 1
    `;
    if (existing) {
      console.log(`  ${record.title.padEnd(10)} already exists`);
      continue;
    }

    const conversationId = randomUUID();
    const recordingId = randomUUID();
    const objectPath = `${organization.id}/${conversationId}/${recordingId}/source.wav`;
    const audio = await readFile(join(values.audio!, record.file));

    const { error: uploadError } = await storage.storage
      .from("conversation-audio")
      .upload(objectPath, audio, { contentType: "audio/wav", upsert: true });
    if (uploadError) {
      console.log(`  ${record.title.padEnd(10)} upload failed: ${uploadError.message}`);
      continue;
    }

    await sql`
      insert into conversations (
        id, organization_id, created_by_membership_id, representative_membership_id,
        location_id, vertical, started_at, lifecycle_status, title
      ) values (
        ${conversationId}, ${organization.id}, ${template.created_by_membership_id},
        ${template.representative_membership_id}, ${template.location_id},
        ${template.vertical}, now(), 'ready', ${record.title}
      )
    `;
    await sql`
      insert into recordings (
        id, organization_id, conversation_id, storage_bucket, storage_object_path,
        mime_type, file_size_bytes, duration_milliseconds, status,
        created_by_membership_id, capture_source, finalized_at
      ) values (
        ${recordingId}, ${organization.id}, ${conversationId}, 'conversation-audio',
        ${objectPath}, 'audio/wav', ${audio.byteLength}, ${record.durationMs}, 'uploaded',
        ${template.created_by_membership_id}, 'browser_recording', now()
      )
    `;
    created += 1;
    console.log(
      `  ${record.title.padEnd(10)} created  ${(record.durationMs / 60000).toFixed(1)} min`,
    );
  }

  console.log(`\n${created} conversation(s) created.`);
} finally {
  await sql.end();
}
