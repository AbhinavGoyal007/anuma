/**
 * Pulling the recordings an ASR evaluation is run against.
 *
 * The audio lives in a private bucket and is only ever served through
 * short-lived signed URLs, so this asks for one per object rather than reaching
 * into storage directly. What lands on disk is customer-recorded speech: it goes
 * to a git-ignored directory and should not travel any further than the machine
 * running the evaluation.
 *
 * A manifest is written alongside, because the file on disk has to be traceable
 * back to the conversation and the transcription run it will be compared with.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/export-eval-audio.mts --org "AG LLC" --out eval/audio
 */

import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/** How long a signed URL needs to live: long enough to download, no longer. */
const SIGNED_URL_TTL_SECONDS = 600;

const { values } = parseArgs({
  options: { org: { type: "string" }, out: { type: "string", default: "eval/audio" } },
});
if (!values.org) {
  console.error('Usage: --org "<organization name>" [--out <directory>]');
  process.exit(1);
}

const databaseUrl = process.env.SUPABASE_DB_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!databaseUrl || !supabaseUrl || !secretKey) {
  console.error("SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  process.exit(1);
}

type Row = {
  recording_id: string;
  conversation_id: string;
  title: string | null;
  storage_bucket: string;
  storage_object_path: string;
  mime_type: string | null;
  duration_milliseconds: string | null;
  file_size_bytes: string | null;
  transcription_run_id: string | null;
  provider: string | null;
  model: string | null;
};

const sql = postgres(databaseUrl, { prepare: false, max: 1, connect_timeout: 30 });
let rows: Row[];
try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  // The current transcription run per recording is carried along so a later
  // comparison knows which baseline each file's existing transcript came from.
  rows = await sql<Row[]>`
    select recording.id as recording_id,
           recording.conversation_id,
           conversation.title,
           recording.storage_bucket,
           recording.storage_object_path,
           recording.mime_type,
           recording.duration_milliseconds,
           recording.file_size_bytes,
           run.id as transcription_run_id,
           run.provider,
           run.model
    from recordings as recording
    join conversations as conversation on conversation.id = recording.conversation_id
    left join lateral (
      select id, provider, model from transcription_runs
      where recording_id = recording.id and status = 'completed'
      order by created_at desc limit 1
    ) as run on true
    where recording.organization_id = ${organization.id}
    order by conversation.created_at
  `;
} finally {
  await sql.end();
}

if (rows.length === 0) {
  console.error("No recordings found.");
  process.exit(1);
}

const storage = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
await mkdir(values.out, { recursive: true });

const manifest: unknown[] = [];
let downloaded = 0;

for (const [index, row] of rows.entries()) {
  const extension = row.storage_object_path.split(".").pop() ?? "audio";
  // Numbered by conversation order so the set is stable and easy to talk about.
  const filename = `${String(index + 1).padStart(2, "0")}-${row.recording_id.slice(0, 8)}.${extension}`;

  const { data, error } = await storage.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_object_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error(`  ${filename}: could not sign — ${error?.message ?? "no url"}`);
    continue;
  }

  const response = await fetch(data.signedUrl);
  if (!response.ok || !response.body) {
    console.error(`  ${filename}: download failed with ${response.status}`);
    continue;
  }
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(join(values.out, filename)),
  );
  downloaded += 1;

  const minutes = Number(row.duration_milliseconds ?? 0) / 60000;
  console.log(`  ${filename}  ${minutes.toFixed(1)} min  ${row.title ?? "(untitled)"}`);

  manifest.push({
    file: filename,
    recordingId: row.recording_id,
    conversationId: row.conversation_id,
    title: row.title,
    mimeType: row.mime_type,
    durationMs: Number(row.duration_milliseconds ?? 0),
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    baseline: row.transcription_run_id
      ? { runId: row.transcription_run_id, provider: row.provider, model: row.model }
      : null,
  });
}

await writeFile(
  join(values.out, "manifest.json"),
  `${JSON.stringify({ organization: values.org, exportedAt: new Date().toISOString(), recordings: manifest }, null, 2)}\n`,
);

const totalMinutes = manifest.reduce(
  (total, entry) => total + (entry as { durationMs: number }).durationMs / 60000,
  0,
);
console.log(
  `\nDownloaded ${downloaded} of ${rows.length} recordings — ${totalMinutes.toFixed(1)} minutes of audio.`,
);
