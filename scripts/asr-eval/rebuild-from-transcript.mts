/**
 * Rebuilding a conversation's interaction record from a different transcript.
 *
 * Everything measured so far has been about transcripts — whether "RTX 4060"
 * survived transcription. That is a proxy. What the product actually sells is a
 * 43-field Commercial Interaction Record, and the only honest test of a
 * transcription change is whether the record comes out the same.
 *
 * This takes a diarized transcript produced outside the app, stores it as a real
 * transcription run against an existing conversation, and then runs the
 * product's own steps over it — speaker mapping, extraction, metrics. Nothing is
 * simulated: the same code path a live recording takes.
 *
 * The previous run is left alone. Transcripts, records and metrics are all
 * versioned, so the Sarvam-derived record stays available to compare against
 * rather than being overwritten by the thing being tested.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/register-alias.mjs \
 *     scripts/asr-eval/rebuild-from-transcript.mts --dir eval/voxtral-prod --org "AG LLC"
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildInteractionRecord } from "@/modules/interaction-record/persistence";
import { normalizeVoxtralTranscript } from "@/modules/transcription/normalize-voxtral";
import { autoMapSpeakers } from "@/modules/speaker-mapping/auto-map";

const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    org: { type: "string" },
    title: { type: "string" },
  },
});
if (!values.dir || !values.org) {
  console.error('Usage: --dir <transcripts> --org "<organization>" [--title "Script 1"]');
  process.exit(1);
}

const db = createAdminClient();

const { data: organization } = await db
  .from("organizations")
  .select("id")
  .eq("name", values.org)
  .order("created_at")
  .limit(1)
  .maybeSingle();
if (!organization) {
  console.error(`No organization named ${values.org}.`);
  process.exit(1);
}

const files = (await readdir(values.dir)).filter((f) => f.endsWith(".json"));

for (const file of files) {
  const payload = JSON.parse(await readFile(join(values.dir, file), "utf8"));
  const title: string = payload.title;
  if (values.title && title !== values.title) continue;

  // The conversation this transcript belongs to. Matched by title because these
  // are the scripted role-plays, which is the only set with a gold answer.
  const { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("title", title)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!conversation) {
    console.log(`  ${title.padEnd(10)} no conversation with this title — skipped`);
    continue;
  }

  const { data: recording } = await db
    .from("recordings")
    .select("id, duration_milliseconds")
    .eq("conversation_id", conversation.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!recording) {
    console.log(`  ${title.padEnd(10)} no recording — skipped`);
    continue;
  }

  let normalized;
  try {
    normalized = normalizeVoxtralTranscript(payload);
  } catch (error) {
    console.log(`  ${title.padEnd(10)} unusable transcript: ${(error as Error).message}`);
    continue;
  }

  // A new run rather than an edit of the old one: derived data is versioned, and
  // the Sarvam record has to survive for the comparison to mean anything.
  const { data: run, error: runError } = await db
    .from("transcription_runs")
    .insert({
      organization_id: organization.id,
      conversation_id: conversation.id,
      recording_id: recording.id,
      provider: "voxtral",
      model: payload.tag ?? "voxtral-mini-3b",
      status: "completed",
      requested_language_mode: "codemix",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      provider_metadata: normalized.providerMetadata as never,
    })
    .select("id")
    .single();
  if (runError || !run) {
    console.log(`  ${title.padEnd(10)} could not open a run: ${runError?.message}`);
    continue;
  }

  const segments = normalized.segments.map((segment, index) => ({
    organization_id: organization.id,
    conversation_id: conversation.id,
    transcription_run_id: run.id,
    sequence_number: index + 1,
    provider_speaker_identifier: segment.providerSpeakerIdentifier,
    start_milliseconds: segment.startMilliseconds,
    end_milliseconds: segment.endMilliseconds,
    original_text: segment.originalText,
    confidence: segment.confidence,
    detected_languages: segment.detectedLanguages,
  }));
  const { error: segmentError } = await db.from("transcript_segments").insert(segments);
  if (segmentError) {
    console.log(`  ${title.padEnd(10)} segments rejected: ${segmentError.message}`);
    continue;
  }

  // Point the conversation at the new run, exactly as the workflow does when a
  // transcript lands, so everything downstream reads this one.
  await db
    .from("conversations")
    .update({ active_transcription_run_id: run.id })
    .eq("id", conversation.id);

  const mapping = await autoMapSpeakers(run.id).catch((error: Error) => {
    console.log(`  ${title.padEnd(10)} speaker mapping failed: ${error.message}`);
    return null;
  });
  if (!mapping) continue;

  try {
    const record = await buildInteractionRecord(conversation.id);
    console.log(
      `  ${title.padEnd(10)} ${segments.length} segments -> record ${record.recordId.slice(0, 8)}`,
    );
  } catch (error) {
    console.log(`  ${title.padEnd(10)} extraction failed: ${(error as Error).message}`);
  }
}

console.log("\nDone. Compare the new records against the previous ones and the gold truth.");
