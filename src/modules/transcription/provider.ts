import "server-only";

import { getTrustedServerEnvironment } from "@/lib/env";
import { OpenAISpeechToTextProvider } from "@/modules/transcription/openai-provider";
import { SarvamSpeechToTextProvider } from "@/modules/transcription/sarvam-provider";
import { VoxtralSpeechToTextProvider } from "@/modules/transcription/voxtral-provider";
import type { SpeechToTextProvider } from "@/modules/transcription/types";

/**
 * The speech-to-text provider configured for new work.
 *
 * Resolved per call rather than held in a module constant so that changing the
 * setting takes effect on the next run instead of the next deployment, and so
 * that a run already in flight is never handed a different provider halfway.
 */
export function speechToTextProvider(): SpeechToTextProvider {
  switch (getTrustedServerEnvironment().TRANSCRIPTION_PROVIDER) {
    case "openai":
      return new OpenAISpeechToTextProvider();
    case "voxtral":
      return new VoxtralSpeechToTextProvider();
    default:
      return new SarvamSpeechToTextProvider();
  }
}
