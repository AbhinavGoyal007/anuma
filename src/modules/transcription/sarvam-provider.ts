import "server-only";

import { SarvamAIClient } from "sarvamai";

import { getTrustedServerEnvironment } from "@/lib/env";
import { normalizeSarvamTranscript } from "@/modules/transcription/normalize-sarvam";
import type {
  BatchSpeechToTextProvider,
  NormalizedTranscript,
  SpeechJobInput,
  SpeechJobStatus,
  SpeechSubmission,
} from "@/modules/transcription/types";

function safeProviderMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Sarvam did not accept the transcription request.";
}

/** Sarvam Batch STT adapter. No Sarvam response shape crosses this boundary. */
export class SarvamSpeechToTextProvider implements BatchSpeechToTextProvider {
  readonly key = "sarvam" as const;
  readonly mode = "batch" as const;
  readonly model = "saaras:v3";
  private readonly client: SarvamAIClient;

  constructor() {
    this.client = new SarvamAIClient({
      apiSubscriptionKey: getTrustedServerEnvironment().SARVAM_API_KEY,
      timeoutInSeconds: 60,
      maxRetries: 2,
    });
  }

  async submit(input: SpeechJobInput): Promise<SpeechSubmission> {
    try {
      const initialized = await this.client.speechToTextJob.initialise({
        job_parameters: {
          model: "saaras:v3",
          mode: "codemix",
          language_code: "unknown",
          with_diarization: true,
          with_timestamps: true,
        },
      });
      const links = await this.client.speechToTextJob.getUploadLinks({
        job_id: initialized.job_id,
        files: [input.fileName],
      });
      const upload = links.upload_urls[input.fileName];
      if (!upload?.file_url) throw new Error("Sarvam did not return an upload URL.");

      const uploadResponse = await fetch(upload.file_url, {
        method: "PUT",
        headers: { "Content-Type": input.mimeType, "x-ms-blob-type": "BlockBlob" },
        body: Buffer.from(input.audio),
      });
      if (!uploadResponse.ok)
        throw new Error(`Sarvam audio transfer failed (${uploadResponse.status}).`);

      await this.client.speechToTextJob.start(initialized.job_id);
      return { providerRequestId: initialized.job_id };
    } catch (error) {
      throw new Error(safeProviderMessage(error));
    }
  }

  async getStatus(providerRequestId: string): Promise<SpeechJobStatus> {
    try {
      const status = await this.client.speechToTextJob.getStatus(providerRequestId);
      if (status.job_state === "Completed") {
        const outputFileNames = (status.job_details ?? []).flatMap((detail) =>
          (detail.outputs ?? []).flatMap((output) => (output.file_name ? [output.file_name] : [])),
        );
        return { state: "completed", outputFileNames };
      }
      if (status.job_state === "Failed") {
        return { state: "failed", message: status.error_message ?? null };
      }
      return { state: status.job_state === "Running" ? "running" : "pending" };
    } catch (error) {
      throw new Error(safeProviderMessage(error));
    }
  }

  async fetchResult(providerRequestId: string, outputFileNames: string[]): Promise<unknown> {
    if (!outputFileNames.length) throw new Error("Sarvam completed without an output file.");
    const links = await this.client.speechToTextJob.getDownloadLinks({
      job_id: providerRequestId,
      files: outputFileNames,
    });
    const firstLink = links.download_urls[outputFileNames[0]];
    if (!firstLink?.file_url) throw new Error("Sarvam did not return a transcript download URL.");
    const response = await fetch(firstLink.file_url);
    if (!response.ok) throw new Error(`Sarvam transcript download failed (${response.status}).`);
    return response.json();
  }

  normalize(raw: unknown): NormalizedTranscript {
    return normalizeSarvamTranscript(raw);
  }
}
