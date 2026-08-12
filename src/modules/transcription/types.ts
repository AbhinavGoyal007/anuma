export type SpeechJobInput = {
  audio: Uint8Array;
  fileName: string;
  mimeType: string;
  callbackUrl?: string;
  callbackToken?: string;
};

export type SpeechSubmission = { providerRequestId: string };

export type SpeechJobStatus =
  | { state: "pending" | "running" }
  | { state: "completed"; outputFileNames: string[] }
  | { state: "failed"; message: string | null };

export type NormalizedTranscriptSegment = {
  providerSpeakerIdentifier: string | null;
  startMilliseconds: number;
  endMilliseconds: number;
  originalText: string;
  detectedLanguages: string[];
  confidence: number | null;
};

export type NormalizedTranscript = {
  segments: NormalizedTranscriptSegment[];
  providerMetadata: Record<string, unknown>;
};

export type ProviderKey = "sarvam" | "openai";

/**
 * A provider that queues work and is polled for a result.
 *
 * Sarvam's Batch STT is this shape: submit, wait, download.
 */
export interface BatchSpeechToTextProvider {
  readonly key: ProviderKey;
  readonly mode: "batch";
  readonly model: string;
  submit(input: SpeechJobInput): Promise<SpeechSubmission>;
  getStatus(providerRequestId: string): Promise<SpeechJobStatus>;
  fetchResult(providerRequestId: string, outputFileNames: string[]): Promise<unknown>;
  normalize(raw: unknown): NormalizedTranscript;
}

/**
 * A provider that returns the transcript from a single call.
 *
 * OpenAI's transcription endpoint is this shape. There is no job to poll, so
 * runs against it never enter the polling loop and never pay for it.
 */
export interface ImmediateSpeechToTextProvider {
  readonly key: ProviderKey;
  readonly mode: "immediate";
  readonly model: string;
  transcribe(input: SpeechJobInput): Promise<NormalizedTranscript>;
}

export type SpeechToTextProvider = BatchSpeechToTextProvider | ImmediateSpeechToTextProvider;
