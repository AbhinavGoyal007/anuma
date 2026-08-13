import { z } from "zod";

import type { NormalizedTranscript } from "@/modules/transcription/types";

/**
 * Reading the worker's diarized transcript.
 *
 * Deliberately the same shape Sarvam returns, because the worker was written to
 * produce it: one entry per speaker turn, carrying the speaker the model heard,
 * the time range, and what was said. Keeping the two providers on one payload
 * shape means the evidence path — a dashboard figure, back to a claim, back to a
 * segment, back to a moment in the audio — does not change when the provider
 * does.
 *
 * Validated rather than trusted. The worker is ours, but it is still a network
 * boundary, and a malformed response should fail loudly here rather than become
 * a transcript with impossible timings that nothing downstream can explain.
 */

const entrySchema = z.object({
  transcript: z.string().min(1),
  start_time_seconds: z.number().finite().nonnegative(),
  end_time_seconds: z.number().finite().nonnegative(),
  speaker_id: z.string().min(1),
});

const payloadSchema = z.object({
  language_code: z.string().optional(),
  diarized_transcript: z.object({ entries: z.array(entrySchema) }),
  metadata: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

export function normalizeVoxtralTranscript(raw: unknown): NormalizedTranscript {
  // A serverless worker answers 200 with an error in the body rather than
  // failing the HTTP call, so the error case is checked before the shape.
  if (raw && typeof raw === "object" && typeof (raw as { error?: unknown }).error === "string") {
    throw new Error(`The transcription worker failed: ${(raw as { error: string }).error}`);
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("The transcription worker returned an unsupported payload.");
  }

  const entries = parsed.data.diarized_transcript.entries;
  if (entries.length === 0) {
    // Silence is a real outcome for a recording that captured nothing, but it
    // is not a transcript, and storing it as one would put an empty interaction
    // into the aggregates as though it were a conversation.
    throw new Error("The transcription worker returned no speech.");
  }

  const segments = entries.map((entry) => {
    const startMilliseconds = Math.round(entry.start_time_seconds * 1000);
    const endMilliseconds = Math.round(entry.end_time_seconds * 1000);
    if (endMilliseconds < startMilliseconds) {
      throw new Error("The transcription worker returned an invalid segment time range.");
    }
    return {
      // Left exactly as the diarizer labelled it. Which speaker is the
      // representative is decided by the application's speaker-mapping step,
      // never inferred from the order the provider happened to emit.
      providerSpeakerIdentifier: entry.speaker_id,
      startMilliseconds,
      endMilliseconds,
      originalText: entry.transcript,
      detectedLanguages: parsed.data.language_code ? [parsed.data.language_code] : [],
      confidence: null,
    };
  });

  return {
    segments,
    providerMetadata: {
      outputShape: "diarized_entries",
      ...(parsed.data.metadata ?? {}),
    },
  };
}
