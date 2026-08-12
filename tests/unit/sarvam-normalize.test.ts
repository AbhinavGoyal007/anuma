import { describe, expect, it } from "vitest";

import { normalizeSarvamTranscript } from "@/modules/transcription/normalize-sarvam";

describe("Sarvam batch transcript normalization", () => {
  it("keeps provider speakers and chunk timestamps without assigning business roles", () => {
    const normalized = normalizeSarvamTranscript({
      language_code: "hi-IN",
      diarized_transcript: {
        entries: [
          {
            transcript: "Budget around eighty thousand.",
            start_time_seconds: 1.2,
            end_time_seconds: 3.8,
            speaker_id: "speaker_7",
          },
          {
            transcript: "Gaming is the main use case.",
            start_time_seconds: 4,
            end_time_seconds: 6.25,
            speaker_id: "speaker_2",
          },
        ],
      },
    });

    expect(normalized.segments).toEqual([
      expect.objectContaining({
        providerSpeakerIdentifier: "speaker_7",
        startMilliseconds: 1200,
        endMilliseconds: 3800,
      }),
      expect.objectContaining({
        providerSpeakerIdentifier: "speaker_2",
        startMilliseconds: 4000,
        endMilliseconds: 6250,
      }),
    ]);
    expect(normalized.providerMetadata).toEqual({
      outputShape: "diarized_entries",
      languageCode: "hi-IN",
    });
  });

  it("rejects an incomplete or invalid provider result instead of fabricating evidence", () => {
    expect(() => normalizeSarvamTranscript({ diarized_transcript: [] })).toThrow(
      "without diarized transcript entries",
    );
    expect(() =>
      normalizeSarvamTranscript({
        diarized_transcript: [
          {
            transcript: "Impossible",
            start_time_seconds: 5,
            end_time_seconds: 2,
            speaker_id: "speaker_0",
          },
        ],
      }),
    ).toThrow("invalid segment time range");
  });
});
