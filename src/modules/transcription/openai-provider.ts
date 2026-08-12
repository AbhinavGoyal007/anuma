import "server-only";

import OpenAI from "openai";

import { getOpenAIEnvironment } from "@/lib/env";
import { audioFileNameFor } from "@/modules/transcription/audio-container";
import type {
  ImmediateSpeechToTextProvider,
  NormalizedTranscript,
  SpeechJobInput,
} from "@/modules/transcription/types";

/**
 * OpenAI transcription with built-in speaker diarization.
 *
 * Unlike Sarvam's Batch API there is no job to submit and poll — one call
 * returns the finished transcript — so runs against this provider skip the
 * polling loop entirely and cost nothing in workflow events while they wait.
 *
 * Speakers come back as capital letters (`A`, `B`, …) rather than numbers. They
 * are still opaque provider labels: which one is the representative is decided
 * by a human during speaker mapping, exactly as with Sarvam.
 */

const MODEL = "gpt-4o-transcribe-diarize";

function safeProviderMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "OpenAI did not accept the transcription request.";
}

type DiarizedResponse = {
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string; speaker: string }>;
};

export class OpenAISpeechToTextProvider implements ImmediateSpeechToTextProvider {
  readonly key = "openai" as const;
  readonly mode = "immediate" as const;
  readonly model = MODEL;

  async transcribe(input: SpeechJobInput): Promise<NormalizedTranscript> {
    const client = new OpenAI({ apiKey: getOpenAIEnvironment().OPENAI_API_KEY });
    try {
      const file = new File([input.audio as unknown as BlobPart], audioFileNameFor(input.mimeType));
      const response = (await client.audio.transcriptions.create({
        file,
        model: MODEL,
        response_format: "diarized_json",
        // Required by the diarization models, and the only reason longer
        // recordings do not fail outright.
        chunking_strategy: "auto",
      } as never)) as unknown as DiarizedResponse;

      const segments = (response.segments ?? []).map((segment) => {
        const startMilliseconds = Math.max(0, Math.round(segment.start * 1000));
        const endMilliseconds = Math.max(startMilliseconds, Math.round(segment.end * 1000));
        return {
          providerSpeakerIdentifier: segment.speaker,
          startMilliseconds,
          endMilliseconds,
          originalText: segment.text.trim(),
          // The endpoint reports no per-segment language or confidence.
          detectedLanguages: [],
          confidence: null,
        };
      });

      const usable = segments.filter((segment) => segment.originalText.length > 0);
      if (!usable.length) throw new Error("OpenAI returned no speech segments.");

      return {
        segments: usable,
        providerMetadata: {
          model: MODEL,
          outputShape: "diarized_json",
          reportedDurationSeconds: response.duration ?? null,
        },
      };
    } catch (error) {
      throw new Error(safeProviderMessage(error));
    }
  }
}
