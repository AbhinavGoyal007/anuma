import { z } from "zod";

import type { NormalizedTranscript } from "@/modules/transcription/types";

const diarizedEntrySchema = z.object({
  transcript: z.string().min(1),
  start_time_seconds: z.number().finite().nonnegative(),
  end_time_seconds: z.number().finite().nonnegative(),
  speaker_id: z.string().min(1),
});

const sarvamResultSchema = z.object({
  language_code: z.string().optional(),
  diarized_transcript: z
    .union([z.object({ entries: z.array(diarizedEntrySchema) }), z.array(diarizedEntrySchema)])
    .optional(),
});

export function normalizeSarvamTranscript(raw: unknown): NormalizedTranscript {
  const parsed = sarvamResultSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Sarvam returned an unsupported transcript payload.");
  const diarized = parsed.data.diarized_transcript;
  const entries = Array.isArray(diarized) ? diarized : diarized?.entries;
  if (!entries?.length) throw new Error("Sarvam completed without diarized transcript entries.");

  const segments = entries.map((entry) => {
    const startMilliseconds = Math.round(entry.start_time_seconds * 1000);
    const endMilliseconds = Math.round(entry.end_time_seconds * 1000);
    if (endMilliseconds < startMilliseconds)
      throw new Error("Sarvam returned an invalid segment time range.");
    return {
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
      outputShape: Array.isArray(diarized) ? "diarized_array" : "diarized_entries",
      languageCode: parsed.data.language_code ?? null,
    },
  };
}
