import { describe, expect, it } from "vitest";

import {
  SAME_SPEAKER_GAP_TOLERANCE_MILLISECONDS,
  mergeConversationalTurns,
  metricRows,
  type MetricSegment,
} from "@/modules/analysis/metrics";

function values(segments: MetricSegment[]) {
  return new Map(metricRows(segments).map((row) => [row.metric_key, row.numeric_value]));
}

const normal: MetricSegment[] = [
  {
    role: "representative",
    start_milliseconds: 0,
    end_milliseconds: 1_000,
    original_text: "Hello there",
  },
  {
    role: "representative",
    start_milliseconds: 1_100,
    end_milliseconds: 3_500,
    original_text: "How can I help",
  },
  {
    role: "customer",
    start_milliseconds: 3_600,
    end_milliseconds: 5_600,
    original_text: "I need a television",
  },
  {
    role: "representative",
    start_milliseconds: 5_700,
    end_milliseconds: 6_700,
    original_text: "Certainly",
  },
];

describe("interaction metrics", () => {
  it("calculates bilateral duration, talk share, word counts, WPM, turns and monologues deterministically", () => {
    const result = values(normal);
    expect(result.get("interaction_duration")).toBe(6_700);
    expect(result.get("representative_talk_duration")).toBe(4_400);
    expect(result.get("customer_talk_duration")).toBe(2_000);
    expect(result.get("representative_talk_share")).toBeCloseTo(0.6875);
    expect(result.get("customer_talk_share")).toBeCloseTo(0.3125);
    expect(
      result.get("representative_talk_share")! + result.get("customer_talk_share")!,
    ).toBeCloseTo(1);
    expect(result.get("representative_word_count")).toBe(7);
    expect(result.get("customer_word_count")).toBe(4);
    expect(result.get("representative_words_per_minute")).toBeCloseTo((7 * 60_000) / 4_400);
    expect(result.get("customer_words_per_minute")).toBe(120);
    expect(result.get("representative_turn_count")).toBe(2);
    expect(result.get("customer_turn_count")).toBe(1);
    expect(result.get("representative_longest_monologue")).toBe(3_500);
    expect(result.get("customer_longest_monologue")).toBe(2_000);
  });

  it("groups additional customers with customers and excludes manager and unknown speech", () => {
    const result = values([
      {
        role: "representative",
        start_milliseconds: 0,
        end_milliseconds: 1_000,
        original_text: "hello",
      },
      {
        role: "customer",
        start_milliseconds: 1_000,
        end_milliseconds: 2_000,
        original_text: "first",
      },
      {
        role: "additional_customer",
        start_milliseconds: 2_100,
        end_milliseconds: 3_000,
        original_text: "second person",
      },
      {
        role: "manager",
        start_milliseconds: 3_000,
        end_milliseconds: 9_000,
        original_text: "exclude manager",
      },
      {
        role: "unknown",
        start_milliseconds: 9_000,
        end_milliseconds: 12_000,
        original_text: "exclude unknown",
      },
    ]);
    expect(result.get("representative_talk_duration")).toBe(1_000);
    expect(result.get("customer_talk_duration")).toBe(1_900);
    expect(result.get("customer_word_count")).toBe(3);
    expect(result.get("customer_turn_count")).toBe(1);
    expect(result.get("representative_talk_share")).toBeCloseTo(1 / 2.9);
    expect(result.get("customer_talk_share")).toBeCloseTo(1.9 / 2.9);
  });

  it("represents single-speaker balance truthfully and omits undefined zero-bilateral values", () => {
    const representativeOnly = values([
      {
        role: "representative",
        start_milliseconds: 0,
        end_milliseconds: 2_000,
        original_text: "only representative",
      },
    ]);
    expect(representativeOnly.get("representative_talk_share")).toBe(1);
    expect(representativeOnly.get("customer_talk_share")).toBe(0);
    expect(representativeOnly.get("representative_words_per_minute")).toBe(60);
    expect(representativeOnly.has("customer_words_per_minute")).toBe(false);

    const zeroDuration = values([
      {
        role: "representative",
        start_milliseconds: 1_000,
        end_milliseconds: 1_000,
        original_text: "ignored",
      },
    ]);
    expect(zeroDuration.get("representative_turn_count")).toBe(0);
    expect(zeroDuration.get("representative_word_count")).toBe(0);
    expect(zeroDuration.has("representative_words_per_minute")).toBe(false);
  });

  it("merges only same participant groups within the documented provider-gap tolerance", () => {
    const turns = mergeConversationalTurns([
      {
        role: "representative",
        start_milliseconds: 0,
        end_milliseconds: 1_000,
        original_text: "one",
      },
      {
        role: "representative",
        start_milliseconds: 1_000 + SAME_SPEAKER_GAP_TOLERANCE_MILLISECONDS,
        end_milliseconds: 2_000,
        original_text: "two",
      },
      {
        role: "representative",
        start_milliseconds: 2_251,
        end_milliseconds: 3_000,
        original_text: "three",
      },
      {
        role: "customer",
        start_milliseconds: 3_000,
        end_milliseconds: 3_500,
        original_text: "reply",
      },
    ]);
    expect(turns.filter((turn) => turn.group === "representative")).toHaveLength(2);
    expect(turns[0]).toMatchObject({ startMilliseconds: 0, endMilliseconds: 2_000 });
  });
});
