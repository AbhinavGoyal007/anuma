import { describe, expect, it } from "vitest";

import {
  normalizeAudioMimeType,
  preferredRecordingConstraints,
} from "@/components/conversations/audio-capture-panel";

describe("browser audio capture", () => {
  it("normalizes MediaRecorder codec MIME values to the server upload contract", () => {
    expect(normalizeAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeAudioMimeType("audio/MP4; codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(normalizeAudioMimeType("video/webm")).toBeNull();
  });

  it("requests voice-oriented constraints without requiring them", () => {
    expect(preferredRecordingConstraints()).toEqual({
      audio: {
        autoGainControl: { ideal: true },
        channelCount: { ideal: 1 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
      },
    });
  });
});
