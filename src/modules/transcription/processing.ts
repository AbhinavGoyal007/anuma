import "server-only";

import { createHash } from "node:crypto";
import { parseBuffer } from "music-metadata";

import { getTrustedServerEnvironment } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { segmentToOriginal, type Timeline } from "@/modules/transcription/audio-timeline";
import { preprocessAudio } from "@/modules/transcription/preprocess-audio";
import type { Json } from "@/lib/supabase/database.generated";
import { speechToTextProvider } from "@/modules/transcription/provider";
import type { NormalizedTranscript } from "@/modules/transcription/types";

const AUDIO_BUCKET = "conversation-audio";

type ProcessingContext = {
  runId: string;
  recordingId: string;
  conversationId: string;
  organizationId: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  providerRequestId: string | null;
};

function looksLikeSupportedAudio(bytes: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, 16));
  const isWebM =
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;
  return (
    text.startsWith("RIFF") ||
    text.startsWith("OggS") ||
    text.startsWith("ID3") ||
    isWebM ||
    text.startsWith("\u001aEÃŸÂ£") ||
    (text.length >= 12 && text.slice(4, 8) === "ftyp") ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}

async function loadProcessingContext(runId: string): Promise<ProcessingContext> {
  const admin = createAdminClient();
  const { data: run, error: runError } = await admin
    .from("transcription_runs")
    .select(
      "id, organization_id, conversation_id, recording_id, provider, status, provider_request_id",
    )
    .eq("id", runId)
    .maybeSingle();
  if (runError || !run) throw new Error("The transcription run no longer exists.");
  if (run.provider !== undefined && run.provider !== "sarvam" && run.provider !== "openai") {
    throw new Error("This workflow does not process runs from that provider.");
  }
  const { data: recording, error: recordingError } = await admin
    .from("recordings")
    .select(
      "id, organization_id, conversation_id, storage_bucket, storage_object_path, mime_type, file_size_bytes, status",
    )
    .eq("id", run.recording_id)
    .maybeSingle();
  if (recordingError || !recording) throw new Error("The source recording no longer exists.");
  if (
    recording.organization_id !== run.organization_id ||
    recording.conversation_id !== run.conversation_id ||
    recording.storage_bucket !== AUDIO_BUCKET
  ) {
    throw new Error("The transcription run and recording relationships do not match.");
  }
  if (recording.status !== "uploaded") throw new Error("The source audio is not secured.");
  return {
    runId: run.id,
    recordingId: recording.id,
    conversationId: run.conversation_id,
    organizationId: run.organization_id,
    storagePath: recording.storage_object_path,
    mimeType: recording.mime_type,
    fileSizeBytes: recording.file_size_bytes,
    providerRequestId: run.provider_request_id,
  };
}

export type SubmissionOutcome =
  /** A batch provider queued the work; the caller must poll for it. */
  | { state: "submitted"; providerRequestId: string; timeline: Timeline }
  /** An immediate provider already returned the transcript; nothing to poll. */
  | { state: "transcribed"; transcript: NormalizedTranscript; timeline: Timeline }
  | { state: "skipped"; reason: string };

export async function submitTranscriptionStep(runId: string): Promise<SubmissionOutcome> {
  "use step";
  const context = await loadProcessingContext(runId);

  // A run that already has a provider job still has to reach the end of this
  // function. The timeline is what translates the provider's timestamps back to
  // real time, and returning early without it would not fail — it would write
  // every segment at the wrong moment, quietly. Recomputing costs one download
  // on a path that is only taken when a step is retried.
  const admin = createAdminClient();
  const { data: audio, error: downloadError } = await admin.storage
    .from(AUDIO_BUCKET)
    .download(context.storagePath);
  if (downloadError || !audio)
    throw new Error("Private audio could not be downloaded for processing.");
  const bytes = new Uint8Array(await audio.arrayBuffer());
  if (bytes.byteLength !== context.fileSizeBytes) {
    throw new Error("The private audio byte length does not match recording metadata.");
  }
  if (!looksLikeSupportedAudio(bytes))
    throw new Error("The uploaded object is not a recognized supported audio file.");
  const metadata = await parseBuffer(bytes, context.mimeType, { duration: true });
  const actualDurationMilliseconds = Math.round((metadata.format.duration ?? 0) * 1000);
  if (!Number.isFinite(actualDurationMilliseconds) || actualDurationMilliseconds < 1) {
    throw new Error("The private audio duration could not be verified.");
  }
  if (actualDurationMilliseconds > 7_200_000) {
    throw new Error("The private audio is longer than the two-hour processing limit.");
  }
  // Sarvam bills per second of audio submitted, so the cheapest transcription is
  // the one never sent. Checked here rather than at upload because this is the
  // first point where the duration has been verified from the audio itself
  // instead of taken from a client's claim.
  const minimumDuration = getTrustedServerEnvironment().TRANSCRIPTION_MIN_DURATION_MS;
  if (actualDurationMilliseconds < minimumDuration) {
    await skipTranscriptionStep(
      runId,
      `Audio is ${Math.round(actualDurationMilliseconds / 1000)}s, below the ${Math.round(
        minimumDuration / 1000,
      )}s minimum for transcription.`,
    );
    return { state: "skipped", reason: "audio_too_short" };
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");

  const { data: recording, error: checksumError } = await admin
    .from("recordings")
    .select("checksum_sha256")
    .eq("id", context.recordingId)
    .single();
  if (checksumError) throw new Error("Recording integrity could not be verified.");
  if (recording.checksum_sha256 && recording.checksum_sha256 !== checksum) {
    throw new Error("The private audio checksum changed unexpectedly.");
  }
  const { error: updateChecksumError } = await admin
    .from("recordings")
    .update({ checksum_sha256: checksum, duration_milliseconds: actualDurationMilliseconds })
    .eq("id", context.recordingId);
  if (updateChecksumError) throw new Error("Recording checksum could not be saved.");

  // The checksum above is taken on the stored original, which never changes.
  // What goes to the provider is a derived copy with the silence removed —
  // billed by the second, so the dead air in a shop-floor recording is the
  // single largest avoidable cost in this pipeline.
  const environment = getTrustedServerEnvironment();
  const fileName = context.storagePath.split("/").at(-1) ?? "source.audio";
  const prepared = environment.AUDIO_TRIM_ENABLED
    ? await preprocessAudio({
        audio: bytes,
        durationMs: actualDurationMilliseconds,
        fileName,
        tempo: environment.AUDIO_TRIM_TEMPO,
      })
    : null;

  const timeline: Timeline = prepared?.timeline ?? { regions: [], tempo: 1 };
  const provider = speechToTextProvider();
  const jobInput = {
    audio: prepared?.audio ?? bytes,
    fileName: prepared && !prepared.passthrough ? `trimmed-${fileName}.m4a` : fileName,
    mimeType: prepared && !prepared.passthrough ? "audio/mp4" : context.mimeType,
  };

  // The run row is created by a database function that names Sarvam. Record
  // what actually ran, so a transcript can always be traced to the model that
  // produced it — which matters most while the two are being compared.
  await admin
    .from("transcription_runs")
    .update({ provider: provider.key, model: provider.model })
    .eq("id", runId);

  if (provider.mode === "immediate") {
    // One call, no job to poll, so the polling loop is never entered.
    const transcript = await provider.transcribe(jobInput);
    await admin
      .from("transcription_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", runId)
      .in("status", ["pending"]);
    return { state: "transcribed", transcript, timeline };
  }

  // Already submitted on an earlier attempt. The provider must not be asked to
  // do the same job twice, but the caller still needs the timeline computed
  // above to read the result correctly.
  if (context.providerRequestId) {
    return { state: "submitted", providerRequestId: context.providerRequestId, timeline };
  }

  const submission = await provider.submit(jobInput);
  const { data: startedRun, error: startedRunError } = await admin
    .from("transcription_runs")
    .select("started_at")
    .eq("id", runId)
    .single();
  if (startedRunError) throw new Error("The transcription timing could not be read.");
  const { error: runError } = await admin
    .from("transcription_runs")
    .update({
      provider_request_id: submission.providerRequestId,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .is("provider_request_id", null);
  if (runError) throw new Error("The Sarvam job reference could not be persisted.");
  // The timeline travels with the workflow rather than being stored: step
  // results are durable, so a replay restores it alongside the job id.
  return { state: "submitted", providerRequestId: submission.providerRequestId, timeline };
}

/**
 * Ends a run that was never worth sending to the provider.
 *
 * Deliberately not a failure. Nothing broke — there was simply not enough audio
 * to transcribe, and marking it `failed` would put a red state in front of a
 * manager for a recording that behaved exactly as expected. The run is
 * `cancelled` and the interaction is `partial`, which reads as "there is
 * nothing here" rather than "something went wrong".
 */
export async function skipTranscriptionStep(runId: string, reason: string): Promise<void> {
  "use step";
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("transcription_runs")
    .select("conversation_id, organization_id")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return;

  await admin
    .from("transcription_runs")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      error_code: "audio_too_short",
      error_message: reason.slice(0, 500),
    })
    .eq("id", runId)
    .in("status", ["pending", "running"]);

  await admin
    .from("conversations")
    .update({ lifecycle_status: "partial" })
    .eq("id", run.conversation_id)
    .eq("organization_id", run.organization_id);
}

export async function pollTranscriptionStep(
  runId: string,
): Promise<
  | { state: "pending" | "running" }
  | { state: "completed"; providerRequestId: string; outputFileNames: string[] }
  | { state: "failed"; message: string | null }
> {
  "use step";
  const context = await loadProcessingContext(runId);
  if (!context.providerRequestId) throw new Error("No Sarvam job has been created for this run.");
  const provider = speechToTextProvider();
  if (provider.mode !== "batch") {
    throw new Error("An immediate provider has no job to poll.");
  }
  const status = await provider.getStatus(context.providerRequestId);
  if (status.state === "completed")
    return { ...status, providerRequestId: context.providerRequestId };
  return status;
}

/** Where a finished transcript comes from, depending on the provider's shape. */
export type TranscriptSource =
  | { kind: "batch"; providerRequestId: string; outputFileNames: string[] }
  | { kind: "immediate"; transcript: NormalizedTranscript };

export async function persistTranscriptStep(
  runId: string,
  source: TranscriptSource,
  timeline: Timeline = { regions: [], tempo: 1 },
): Promise<void> {
  "use step";
  const context = await loadProcessingContext(runId);

  let result: NormalizedTranscript;
  if (source.kind === "immediate") {
    result = source.transcript;
  } else {
    if (context.providerRequestId !== source.providerRequestId) {
      throw new Error("The provider job does not belong to this transcription run.");
    }
    const provider = speechToTextProvider();
    if (provider.mode !== "batch") {
      throw new Error("A batch result cannot be fetched from an immediate provider.");
    }
    result = provider.normalize(
      await provider.fetchResult(source.providerRequestId, source.outputFileNames),
    );
  }

  // The provider timed the audio it was given, which had the silence taken out.
  // Everything downstream — playback, talk-ratio metrics, the evidence a
  // manager opens during review — refers to the recording as it was made, so
  // the timestamps are put back on that timeline before anything is written.
  const normalized = {
    ...result,
    segments: result.segments.map((segment) => ({
      ...segment,
      ...segmentToOriginal(segment, timeline),
    })),
  };
  const admin = createAdminClient();
  const { data: startedRun, error: startedRunError } = await admin
    .from("transcription_runs")
    .select("started_at")
    .eq("id", runId)
    .single();
  if (startedRunError) throw new Error("The transcription timing could not be read.");

  for (const [sequenceNumber, segment] of normalized.segments.entries()) {
    const { data: existing, error: existingError } = await admin
      .from("transcript_segments")
      .select("original_text, start_milliseconds, end_milliseconds, provider_speaker_identifier")
      .eq("transcription_run_id", runId)
      .eq("sequence_number", sequenceNumber)
      .maybeSingle();
    if (existingError) throw new Error("Existing transcript evidence could not be checked.");
    if (existing) {
      const identical =
        existing.original_text === segment.originalText &&
        existing.start_milliseconds === segment.startMilliseconds &&
        existing.end_milliseconds === segment.endMilliseconds &&
        existing.provider_speaker_identifier === segment.providerSpeakerIdentifier;
      if (!identical) throw new Error("A retry found conflicting immutable transcript evidence.");
      continue;
    }
    const { error: insertError } = await admin.from("transcript_segments").insert({
      organization_id: context.organizationId,
      conversation_id: context.conversationId,
      transcription_run_id: runId,
      sequence_number: sequenceNumber,
      provider_speaker_identifier: segment.providerSpeakerIdentifier,
      start_milliseconds: segment.startMilliseconds,
      end_milliseconds: segment.endMilliseconds,
      original_text: segment.originalText,
      confidence: segment.confidence,
      detected_languages: segment.detectedLanguages,
    });
    if (insertError) throw new Error("Transcript evidence could not be saved.");
  }

  const completedAt = new Date().toISOString();
  const { error: runError } = await admin
    .from("transcription_runs")
    .update({
      status: "completed",
      completed_at: completedAt,
      latency_milliseconds: Math.max(
        0,
        Date.now() - Date.parse(startedRun.started_at ?? completedAt),
      ),
      provider_metadata: normalized.providerMetadata as Json,
    })
    .eq("id", runId);
  if (runError) throw new Error("The transcription run could not be completed.");
  const { error: conversationError } = await admin
    .from("conversations")
    .update({ active_transcription_run_id: runId, lifecycle_status: "partial" })
    .eq("id", context.conversationId)
    .eq("organization_id", context.organizationId);
  if (conversationError) throw new Error("The active transcript could not be selected.");
}

export async function failTranscriptionStep(runId: string, reason: string): Promise<void> {
  "use step";
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("transcription_runs")
    .select("conversation_id, organization_id")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return;
  await admin
    .from("transcription_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_code: "transcription_failed",
      error_message: reason.slice(0, 500),
    })
    .eq("id", runId)
    .in("status", ["pending", "running"]);
  await admin
    .from("conversations")
    .update({ lifecycle_status: "failed" })
    .eq("id", run.conversation_id)
    .eq("organization_id", run.organization_id);
}
