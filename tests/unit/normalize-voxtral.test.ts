import { describe, expect, it } from "vitest";

import { normalizeVoxtralTranscript } from "@/modules/transcription/normalize-voxtral";

/**
 * The worker is ours, but it is still a network boundary. What is pinned here is
 * that a malformed answer fails loudly rather than becoming a transcript with
 * impossible timings that nothing downstream can explain — and that speaker
 * labels arrive untouched, because deciding which speaker is the representative
 * is the application's job and never the transcriber's.
 */

function payload(overrides: Record<string, unknown> = {}) {
  return {
    language_code: "en",
    diarized_transcript: {
      entries: [
        {
          transcript: "Good afternoon. Looking for something specific today?",
          start_time_seconds: 0.52,
          end_time_seconds: 3.44,
          speaker_id: "SPEAKER_01",
        },
        {
          transcript: "Yes, I need a gaming laptop with an RTX 4060 and 16 gigs of RAM.",
          start_time_seconds: 3.9,
          end_time_seconds: 9.1,
          speaker_id: "SPEAKER_00",
        },
      ],
    },
    metadata: { realtimeFactor: 8.4, turnCount: 2, speakerCount: 2 },
    ...overrides,
  };
}

describe("reading the transcription worker's answer", () => {
  it("keeps the speaker, the timing and the words", () => {
    const result = normalizeVoxtralTranscript(payload());
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({
      providerSpeakerIdentifier: "SPEAKER_01",
      startMilliseconds: 520,
      endMilliseconds: 3440,
      detectedLanguages: ["en"],
      confidence: null,
    });
    expect(result.segments[1]!.originalText).toContain("RTX 4060");
  });

  it("does not renumber or interpret the speaker labels", () => {
    // The first entry is the representative here, but a transcript where the
    // customer speaks first must look exactly the same to the application.
    const result = normalizeVoxtralTranscript(payload());
    expect(result.segments.map((s) => s.providerSpeakerIdentifier)).toEqual([
      "SPEAKER_01",
      "SPEAKER_00",
    ]);
  });

  it("carries the worker's own measurements through for the run record", () => {
    const result = normalizeVoxtralTranscript(payload());
    expect(result.providerMetadata).toMatchObject({
      outputShape: "diarized_entries",
      realtimeFactor: 8.4,
      speakerCount: 2,
    });
  });

  it("surfaces an error the worker reported in a successful response", () => {
    // A serverless worker answers 200 with the failure in the body, so this is
    // the shape a real outage arrives in.
    expect(() => normalizeVoxtralTranscript({ error: "CUDA out of memory" })).toThrow(
      /CUDA out of memory/,
    );
  });

  it("refuses a segment that ends before it starts", () => {
    const broken = payload();
    broken.diarized_transcript.entries[0]!.end_time_seconds = 0.1;
    expect(() => normalizeVoxtralTranscript(broken)).toThrow(/invalid segment time range/);
  });

  it("refuses silence rather than storing an empty interaction", () => {
    expect(() =>
      normalizeVoxtralTranscript(payload({ diarized_transcript: { entries: [] } })),
    ).toThrow(/no speech/);
  });

  it("refuses a payload that is not a transcript at all", () => {
    expect(() => normalizeVoxtralTranscript({ text: "just some prose" })).toThrow(
      /unsupported payload/,
    );
  });
});
