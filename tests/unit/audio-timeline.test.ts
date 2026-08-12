import { describe, expect, it } from "vitest";

import {
  normalizeRegions,
  segmentToOriginal,
  speechFromSilence,
  toOriginalMs,
  totalSpeechMs,
  type Timeline,
} from "@/modules/transcription/audio-timeline";

/**
 * These are the sums that decide whether a citation points at the right moment.
 *
 * Nobody can check them by listening: a timestamp that is eleven seconds out
 * still lands on plausible speech, so the error is invisible until a manager
 * disputes evidence that does not say what the transcript claims.
 */

describe("speechFromSilence", () => {
  it("keeps what silence detection did not claim", () => {
    const speech = speechFromSilence(
      [
        { startMs: 2_000, endMs: 5_000 },
        { startMs: 9_000, endMs: 12_000 },
      ],
      15_000,
    );

    expect(speech).toEqual([
      { startMs: 0, endMs: 2_000 },
      { startMs: 5_000, endMs: 9_000 },
      { startMs: 12_000, endMs: 15_000 },
    ]);
  });

  it("handles a recording that opens and closes in silence", () => {
    const speech = speechFromSilence(
      [
        { startMs: 0, endMs: 3_000 },
        { startMs: 8_000, endMs: 10_000 },
      ],
      10_000,
    );

    expect(speech).toEqual([{ startMs: 3_000, endMs: 8_000 }]);
  });

  it("returns nothing when the whole recording is silent", () => {
    expect(speechFromSilence([{ startMs: 0, endMs: 10_000 }], 10_000)).toEqual([]);
  });
});

describe("normalizeRegions", () => {
  it("pads regions so the first phoneme is not clipped", () => {
    // Detection releases slightly after speech resumes, and the first word of a
    // sentence is very often the one carrying the price or the brand name.
    const regions = normalizeRegions([{ startMs: 5_000, endMs: 6_000 }], {
      padMs: 200,
      durationMs: 10_000,
    });

    expect(regions).toEqual([{ startMs: 4_800, endMs: 6_200 }]);
  });

  it("never pads past the ends of the recording", () => {
    const regions = normalizeRegions([{ startMs: 100, endMs: 9_900 }], {
      padMs: 500,
      durationMs: 10_000,
    });

    expect(regions).toEqual([{ startMs: 0, endMs: 10_000 }]);
  });

  it("merges regions that padding pushed into each other", () => {
    const regions = normalizeRegions(
      [
        { startMs: 1_000, endMs: 2_000 },
        { startMs: 2_300, endMs: 3_000 },
      ],
      { padMs: 200, durationMs: 10_000 },
    );

    expect(regions).toEqual([{ startMs: 800, endMs: 3_200 }]);
  });

  it("sorts regions that arrive out of order", () => {
    const regions = normalizeRegions(
      [
        { startMs: 5_000, endMs: 6_000 },
        { startMs: 1_000, endMs: 2_000 },
      ],
      { durationMs: 10_000 },
    );

    expect(regions.map((region) => region.startMs)).toEqual([1_000, 5_000]);
  });
});

describe("toOriginalMs", () => {
  // 3s of speech, 5s of silence removed, 4s of speech.
  const timeline: Timeline = {
    regions: [
      { startMs: 0, endMs: 3_000 },
      { startMs: 8_000, endMs: 12_000 },
    ],
    tempo: 1,
  };

  it("leaves the first region alone", () => {
    expect(toOriginalMs(0, timeline)).toBe(0);
    expect(toOriginalMs(1_500, timeline)).toBe(1_500);
  });

  it("adds back the silence that was cut out", () => {
    // 100ms into the second kept region, which really began at 8s.
    expect(toOriginalMs(3_100, timeline)).toBe(8_100);
    expect(toOriginalMs(7_000, timeline)).toBe(12_000);
  });

  it("undoes tempo before mapping", () => {
    const stretched: Timeline = { ...timeline, tempo: 1.25 };

    // 2,480ms of sped-up audio is 3,100ms of real speech, which lands 100ms
    // into the region beginning at 8s.
    expect(toOriginalMs(2_480, stretched)).toBe(8_100);
  });

  it("clamps past the end instead of inventing time", () => {
    expect(toOriginalMs(999_999, timeline)).toBe(12_000);
  });

  it("is the identity when nothing was removed", () => {
    expect(toOriginalMs(4_321, { regions: [], tempo: 1 })).toBe(4_321);
  });

  it("never maps backwards as time advances", () => {
    let previous = -1;
    for (let processed = 0; processed <= 7_000; processed += 137) {
      const original = toOriginalMs(processed, timeline);
      expect(original).toBeGreaterThanOrEqual(previous);
      previous = original;
    }
  });
});

describe("segmentToOriginal", () => {
  const timeline: Timeline = {
    regions: [
      { startMs: 0, endMs: 3_000 },
      { startMs: 8_000, endMs: 12_000 },
    ],
    tempo: 1,
  };

  it("maps both ends of a segment", () => {
    expect(
      segmentToOriginal({ startMilliseconds: 3_100, endMilliseconds: 4_100 }, timeline),
    ).toEqual({ startMilliseconds: 8_100, endMilliseconds: 9_100 });
  });

  it("keeps a segment that spanned a cut from ending before it starts", () => {
    // Words either side of removed silence arrive as one provider segment.
    const mapped = segmentToOriginal(
      { startMilliseconds: 2_900, endMilliseconds: 3_100 },
      timeline,
    );

    expect(mapped.endMilliseconds).toBeGreaterThanOrEqual(mapped.startMilliseconds);
  });
});

describe("totalSpeechMs", () => {
  it("sums what will actually be billed", () => {
    expect(
      totalSpeechMs([
        { startMs: 0, endMs: 3_000 },
        { startMs: 8_000, endMs: 12_000 },
      ]),
    ).toBe(7_000);
  });
});
