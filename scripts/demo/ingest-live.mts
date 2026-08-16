/**
 * Putting a recording made on a phone through the product's own path.
 *
 * The audio is uploaded to the same private bucket a browser capture writes to,
 * and the conversation and recording rows are the ones the app would have
 * created, so everything downstream — playback, evidence links, the record —
 * behaves exactly as it would for a live capture.
 */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "AG LLC" },
    audio: { type: "string" },
    transcript: { type: "string" },
    title: { type: "string", default: "Store floor — washing machine" },
  },
});

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

try {
  const [org] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1`;
  if (!org) throw new Error("no such organization");
  const [member] = await sql<{ id: string }[]>`
    select id from organization_memberships where organization_id = ${org.id} order by created_at limit 1`;
  const [loc] = await sql<{ id: string }[]>`
    select id from locations where organization_id = ${org.id} limit 1`;

  const [existing] = await sql<{ id: string }[]>`
    select id from conversations where organization_id = ${org.id} and title = ${values.title!} limit 1`;
  const conversationId = existing?.id ?? randomUUID();
  const audio = await readFile(values.audio!);
  const payload = JSON.parse(await readFile(values.transcript!, "utf8"));
  const durationMs = Math.round((payload.audioSeconds ?? 0) * 1000);

  if (!existing) {
    await sql`insert into conversations (id, organization_id, created_by_membership_id,
      representative_membership_id, location_id, vertical, started_at, ended_at, lifecycle_status, title)
      values (${conversationId}, ${org.id}, ${member!.id}, ${member!.id}, ${loc?.id ?? null},
      'electronics', now() - interval '1 hour', now(), 'ready', ${values.title!})`;
    const recordingId = randomUUID();
    const objectPath = `${org.id}/${conversationId}/${recordingId}/source.wav`;
    const { error } = await storage.storage.from("conversation-audio")
      .upload(objectPath, audio, { contentType: "audio/wav", upsert: true });
    if (error) throw new Error(`upload failed: ${error.message}`);
    await sql`insert into recordings (id, organization_id, conversation_id, storage_bucket,
      storage_object_path, mime_type, file_size_bytes, duration_milliseconds, status,
      created_by_membership_id, capture_source, finalized_at)
      values (${recordingId}, ${org.id}, ${conversationId}, 'conversation-audio', ${objectPath},
      'audio/wav', ${audio.byteLength}, ${durationMs}, 'uploaded', ${member!.id}, 'browser_recording', now())`;
  }

  payload.title = values.title;
  await writeFile(values.transcript!, `${JSON.stringify(payload, null, 1)}\n`, "utf8");
  console.log(`conversation ${conversationId}\naudio ${(audio.byteLength / 1e6).toFixed(1)} MB uploaded\nduration ${(durationMs / 60000).toFixed(1)} min`);
} finally {
  await sql.end();
}
