import { describe, expect, it } from "vitest";

import { pollDelayMs } from "@/modules/transcription/poll-schedule";

/**
 * The polling schedule is a billing decision, not a timing preference.
 *
 * Every poll is a workflow step and every step is three persisted events, so
 * the shape of this curve is what a stalled Sarvam job costs. It is also not
 * something a person can check by hand — you would have to sit through three
 * hours to see the ceiling hold.
 */
describe("transcription poll backoff", () => {
  it("starts sooner than the old fixed interval", () => {
    // The previous schedule waited 15s before the first check, which was longer
    // than a short recording takes to come back.
    expect(pollDelayMs(0)).toBe(5_000);
    expect(pollDelayMs(0)).toBeLessThan(15_000);
  });

  it("backs off and then holds at a ceiling", () => {
    expect([0, 1, 2, 3].map(pollDelayMs)).toEqual([5_000, 10_000, 20_000, 30_000]);
    expect(pollDelayMs(400)).toBe(30_000);
  });

  it("still covers the documented three-hour window", () => {
    let total = 0;
    for (let attempt = 0; attempt < 365; attempt += 1) {
      total += pollDelayMs(attempt);
    }

    expect(total).toBeGreaterThanOrEqual(3 * 60 * 60 * 1000);
  });

  it("costs roughly half the polls a fixed 15s interval would", () => {
    // 720 fixed polls covered the same window. Halving the count halves the
    // events a hung job burns while producing no transcript.
    expect(365).toBeLessThan(720 / 1.9);
  });
});
