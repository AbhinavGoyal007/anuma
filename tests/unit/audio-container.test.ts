import { describe, expect, it } from "vitest";

import { audioFileNameFor } from "@/modules/transcription/audio-container";

/**
 * This mapping is not cosmetic. OpenAI reads the container from the filename,
 * so an Opus recording sent as `.m4a` comes back as "Audio file might be
 * corrupted or unsupported" — which is exactly how it failed the first time.
 */
describe("audioFileNameFor", () => {
  it("names browser captures as Ogg", () => {
    expect(audioFileNameFor("audio/ogg")).toBe("audio.ogg");
    expect(audioFileNameFor("audio/ogg; codecs=opus")).toBe("audio.ogg");
  });

  it("names phone captures as MP4", () => {
    expect(audioFileNameFor("audio/mp4")).toBe("audio.m4a");
  });

  it("covers the other accepted upload formats", () => {
    expect(audioFileNameFor("audio/webm")).toBe("audio.webm");
    expect(audioFileNameFor("audio/wav")).toBe("audio.wav");
    expect(audioFileNameFor("audio/x-wav")).toBe("audio.wav");
    expect(audioFileNameFor("audio/mpeg")).toBe("audio.mp3");
  });

  it("is case-insensitive", () => {
    expect(audioFileNameFor("AUDIO/OGG")).toBe("audio.ogg");
  });

  it("falls back to MP4 for anything unrecognized", () => {
    expect(audioFileNameFor("application/octet-stream")).toBe("audio.m4a");
  });
});
