import { describe, expect, it } from "vitest";

import {
  heuristicRepresentative,
  repLikeness,
  resolveSpeaker,
  speakerStats,
  type SpeakerTurn,
} from "@/modules/speaker-mapping/heuristics";

/**
 * The heuristics are the independent second opinion that lets an automatic
 * mapping be committed without a human. They only earn that role if they lean
 * the right way on the behaviour that actually distinguishes a representative:
 * opening the conversation and driving it with questions.
 */

// A stylised but realistic retail exchange: A greets and asks, B answers.
const conversation: SpeakerTurn[] = [
  { speaker: "1", text: "Hello sir, aap kya dekh rahe hain? Kaunsa laptop chahiye?", sequence: 0 },
  { speaker: "2", text: "Mujhe gaming ke liye chahiye, budget 80 hazaar.", sequence: 1 },
  { speaker: "1", text: "Theek hai. Aapko RTX chahiye ya integrated chalega?", sequence: 2 },
  { speaker: "2", text: "RTX hona chahiye.", sequence: 3 },
  {
    speaker: "1",
    text: "Main aapko Lenovo LOQ dikhata hoon. Kitne din mein chahiye?",
    sequence: 4,
  },
];

describe("speakerStats", () => {
  it("counts turns, words, questions and who spoke first", () => {
    const stats = speakerStats(conversation);
    const one = stats.find((s) => s.speaker === "1")!;
    const two = stats.find((s) => s.speaker === "2")!;

    expect(one.turns).toBe(3);
    expect(one.questions).toBeGreaterThan(two.questions);
    expect(one.firstToSpeak).toBe(true);
    expect(two.firstToSpeak).toBe(false);
  });

  it("does not care what order the turns arrive in", () => {
    const shuffled = [...conversation].reverse();
    const stats = speakerStats(shuffled);
    expect(stats.find((s) => s.speaker === "1")!.firstToSpeak).toBe(true);
  });
});

describe("repLikeness", () => {
  it("scores the question-asking opener above the answerer", () => {
    const scores = repLikeness(speakerStats(conversation));
    expect(scores.get("1")!).toBeGreaterThan(scores.get("2")!);
  });
});

describe("heuristicRepresentative", () => {
  it("picks the representative from behaviour, not from the speaker id", () => {
    // Speaker "2" is the customer even though a naive rule might read a lower id
    // or more-recent turn as the rep.
    expect(heuristicRepresentative(conversation).representative).toBe("1");
  });

  it("reports a positive margin when the speakers really differ", () => {
    expect(heuristicRepresentative(conversation).margin).toBeGreaterThan(0);
  });

  it("returns the only speaker when the audio is single-voice", () => {
    const solo: SpeakerTurn[] = [{ speaker: "1", text: "Testing one two three.", sequence: 0 }];
    expect(heuristicRepresentative(solo)).toEqual({ representative: "1", margin: 0 });
  });

  it("handles an empty transcript without throwing", () => {
    expect(heuristicRepresentative([])).toEqual({ representative: null, margin: 0 });
  });
});

describe("resolveSpeaker", () => {
  const speakers = ["1", "2"];

  it("takes an exact id", () => {
    expect(resolveSpeaker("1", speakers)).toBe("1");
  });

  it("recovers an id the model wrapped or prefixed", () => {
    // The exact bug this guards: the model echoed "[1]" and it matched no real
    // speaker, so the mapping silently lost its representative.
    expect(resolveSpeaker("[1]", speakers)).toBe("1");
    expect(resolveSpeaker("Speaker 2", speakers)).toBe("2");
  });

  it("abstains rather than guess when nothing matches", () => {
    expect(resolveSpeaker("the manager", speakers)).toBeNull();
    expect(resolveSpeaker(null, speakers)).toBeNull();
  });

  it("abstains when the answer could be more than one speaker", () => {
    // With single-character ids, an answer containing both is ambiguous.
    expect(resolveSpeaker("1 and 2", speakers)).toBeNull();
  });
});
