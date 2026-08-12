/**
 * A language-agnostic guess at which diarized speaker is the representative.
 *
 * This exists to cross-check the model, not to replace it. Two independent
 * methods agreeing is what makes an automatic mapping trustworthy enough to
 * commit without a human: when the heuristics and the model reach the same
 * answer the mapping is confident, and when they diverge the confidence is
 * lowered so downstream can treat that record with more caution.
 *
 * The signals are deliberately the ones that survive Hindi, English and
 * code-mixing:
 *
 *  - the representative opens the conversation (the greeting);
 *  - the representative drives it with questions (discovery);
 *  - the representative tends to hold the floor longer overall.
 *
 * No positional assumption is made — the guide forbids taking provider speaker
 * "0" for the representative — every signal is computed from behaviour.
 */

export type SpeakerTurn = { speaker: string; text: string; sequence: number };

/**
 * Matches a model's free-text answer back to a real diarized speaker id.
 *
 * A model asked to name a speaker may return "Speaker 1" or "[1]" for the id
 * "1", and an id that matches nothing silently corrupts the mapping. An exact
 * match wins; otherwise the single known id the answer clearly refers to.
 * Anything that resolves to zero or several speakers is treated as an
 * abstention rather than a wrong guess.
 */
export function resolveSpeaker(answer: string | null, speakers: readonly string[]): string | null {
  if (!answer) return null;
  if (speakers.includes(answer)) return answer;
  const matches = speakers.filter(
    (id) => answer === id || answer.includes(id) || id.includes(answer),
  );
  return matches.length === 1 ? matches[0]! : null;
}

export type SpeakerStats = {
  speaker: string;
  turns: number;
  words: number;
  questions: number;
  firstToSpeak: boolean;
};

/** Question marks across scripts, plus the common Devanagari danda-with-question. */
function countQuestions(text: string): number {
  return (text.match(/[?？]/g) ?? []).length;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function speakerStats(turns: readonly SpeakerTurn[]): SpeakerStats[] {
  const ordered = [...turns].sort((a, b) => a.sequence - b.sequence);
  const firstSpeaker = ordered.find((turn) => turn.text.trim().length > 0)?.speaker;

  const bySpeaker = new Map<string, SpeakerStats>();
  for (const turn of ordered) {
    const stats =
      bySpeaker.get(turn.speaker) ??
      ({
        speaker: turn.speaker,
        turns: 0,
        words: 0,
        questions: 0,
        firstToSpeak: turn.speaker === firstSpeaker,
      } satisfies SpeakerStats);
    stats.turns += 1;
    stats.words += countWords(turn.text);
    stats.questions += countQuestions(turn.text);
    bySpeaker.set(turn.speaker, stats);
  }
  return [...bySpeaker.values()];
}

/**
 * A 0..1 rep-likeness score per speaker, from the behavioural signals.
 *
 * Question share carries the most weight because it is the sharpest divider in
 * a sales conversation: the representative asks, the customer answers. Opening
 * the conversation and holding more of the floor are lighter corroborating
 * nudges, not decisive on their own.
 */
export function repLikeness(stats: readonly SpeakerStats[]): Map<string, number> {
  const totalQuestions = stats.reduce((sum, s) => sum + s.questions, 0);
  const totalWords = stats.reduce((sum, s) => sum + s.words, 0);

  const scores = new Map<string, number>();
  for (const s of stats) {
    const questionShare = totalQuestions > 0 ? s.questions / totalQuestions : 0;
    const wordShare = totalWords > 0 ? s.words / totalWords : 0;
    const score = 0.6 * questionShare + 0.25 * wordShare + (s.firstToSpeak ? 0.15 : 0);
    scores.set(s.speaker, score);
  }
  return scores;
}

export type HeuristicGuess = {
  /** The speaker the heuristics believe is the representative, or null. */
  representative: string | null;
  /** How separated the top two rep-likeness scores are, 0..1. */
  margin: number;
};

/**
 * The heuristic pick for the representative.
 *
 * `margin` is the gap between the leading speaker and the next — a small gap
 * means the signals did not really distinguish them, which should temper how
 * much weight this guess is given against the model's.
 */
export function heuristicRepresentative(turns: readonly SpeakerTurn[]): HeuristicGuess {
  const stats = speakerStats(turns);
  if (stats.length === 0) return { representative: null, margin: 0 };
  if (stats.length === 1) return { representative: stats[0]!.speaker, margin: 0 };

  const scores = repLikeness(stats);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  return {
    representative: top![0],
    margin: Math.max(0, top![1] - (second?.[1] ?? 0)),
  };
}
