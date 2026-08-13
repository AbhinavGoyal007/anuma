import "server-only";

import { getTrustedServerEnvironment } from "@/lib/env";
import { normalizeVoxtralTranscript } from "@/modules/transcription/normalize-voxtral";
import type {
  ImmediateSpeechToTextProvider,
  NormalizedTranscript,
  SpeechJobInput,
} from "@/modules/transcription/types";

/**
 * Transcription through a self-hosted Voxtral worker.
 *
 * Measured against ANUMA's own test pack, Voxtral-Mini-3B recovered 81 of the 84
 * facts actually spoken across thirteen scripts, against Sarvam's 80 — the same
 * accuracy, for roughly a twentieth of the cost. The reason to run it is the
 * cost, not a claimed improvement.
 *
 * Immediate rather than batch: there is no job to poll because the worker is
 * ours. It answers with a diarized transcript in the shape Sarvam's batch API
 * returns, which it has to construct itself — Voxtral produces prose, and the
 * speaker turns and time ranges come from pyannote inside the worker. See
 * `services/voxtral-asr/`.
 *
 * A recording is sent as bytes and never written anywhere in between, so audio
 * reaches exactly one destination: an endpoint the organization controls.
 */
export class VoxtralSpeechToTextProvider implements ImmediateSpeechToTextProvider {
  readonly key = "voxtral" as const;
  readonly mode = "immediate" as const;
  readonly model = "voxtral-mini-3b";

  async transcribe(input: SpeechJobInput): Promise<NormalizedTranscript> {
    const environment = getTrustedServerEnvironment();
    const endpoint = environment.VOXTRAL_ENDPOINT_URL;
    if (!endpoint) {
      throw new Error("VOXTRAL_ENDPOINT_URL is not configured.");
    }

    // A four-minute conversation is roughly fifty turns, each its own model
    // call, and a cold worker loads several gigabytes before the first one.
    // Long, but bounded — a request that hangs forever is worse than one that
    // fails and is retried by the workflow.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": input.mimeType || "audio/wav",
          ...(environment.VOXTRAL_ENDPOINT_TOKEN
            ? { Authorization: `Bearer ${environment.VOXTRAL_ENDPOINT_TOKEN}` }
            : {}),
        },
        body: new Uint8Array(input.audio) as unknown as BodyInit,
        signal: controller.signal,
      });
    } catch (error) {
      // The endpoint is infrastructure the organization runs; naming it in the
      // message is the difference between a five-minute fix and an afternoon.
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(`The transcription worker could not be reached: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `The transcription worker returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`,
      );
    }

    return this.normalize(await response.json());
  }

  /** Exposed so the payload shape can be tested without a worker running. */
  normalize(raw: unknown): NormalizedTranscript {
    return normalizeVoxtralTranscript(raw);
  }
}
