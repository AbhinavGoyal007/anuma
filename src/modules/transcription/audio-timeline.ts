/**
 * Mapping between processed audio time and real recording time.
 *
 * Silence is removed before audio is sent for transcription, because the
 * provider bills every second submitted and a showroom recording is mostly dead
 * air. The provider therefore returns timestamps on a timeline that no longer
 * matches the recording anyone can listen to.
 *
 * Every downstream use of a timestamp — playing back the moment a claim was
 * made, the talk-ratio metrics, the evidence a manager checks during review —
 * depends on translating those back. A quiet error here does not fail; it moves
 * every citation somewhere slightly wrong, which is worse.
 *
 * Deliberately free of server-only imports so the arithmetic can be tested on
 * its own.
 */

/** A stretch of audio kept for transcription, in original recording time. */
export type SpeechRegion = { startMs: number; endMs: number };

export function regionDuration(region: SpeechRegion): number {
  return Math.max(0, region.endMs - region.startMs);
}

export function totalSpeechMs(regions: readonly SpeechRegion[]): number {
  return regions.reduce((total, region) => total + regionDuration(region), 0);
}

/**
 * Sorts, pads and merges detected speech regions.
 *
 * Padding matters more than it looks. Silence detection triggers a little after
 * speech actually stops and releases a little after it restarts, so cutting on
 * the raw boundaries clips the first consonant of the word that broke the
 * silence — and the first word of a sentence is very often the one carrying the
 * number or the brand name.
 */
export function normalizeRegions(
  regions: readonly SpeechRegion[],
  options: { padMs?: number; durationMs: number },
): SpeechRegion[] {
  const pad = Math.max(0, options.padMs ?? 0);
  const padded = regions
    .map((region) => ({
      startMs: Math.max(0, Math.floor(region.startMs) - pad),
      endMs: Math.min(options.durationMs, Math.ceil(region.endMs) + pad),
    }))
    .filter((region) => regionDuration(region) > 0)
    .sort((left, right) => left.startMs - right.startMs);

  const merged: SpeechRegion[] = [];
  for (const region of padded) {
    const previous = merged.at(-1);
    // Touching counts as overlapping: two regions separated by nothing are one
    // region, and leaving them split would add a needless cut point.
    if (previous && region.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, region.endMs);
      continue;
    }
    merged.push({ ...region });
  }
  return merged;
}

/**
 * Inverts silence intervals into the speech between them.
 *
 * `silencedetect` reports what to remove; everything it does not report is what
 * to keep.
 */
export function speechFromSilence(
  silences: readonly SpeechRegion[],
  durationMs: number,
): SpeechRegion[] {
  const ordered = [...silences].sort((left, right) => left.startMs - right.startMs);
  const speech: SpeechRegion[] = [];
  let cursor = 0;

  for (const silence of ordered) {
    if (silence.startMs > cursor) {
      speech.push({ startMs: cursor, endMs: Math.min(silence.startMs, durationMs) });
    }
    cursor = Math.max(cursor, silence.endMs);
  }
  if (cursor < durationMs) speech.push({ startMs: cursor, endMs: durationMs });

  return speech.filter((region) => regionDuration(region) > 0);
}

export type Timeline = {
  /** Kept regions, in original recording time, sorted and non-overlapping. */
  regions: SpeechRegion[];
  /** Playback rate applied after trimming. 1 means untouched. */
  tempo: number;
};

/**
 * Converts a timestamp from the audio the provider saw back to real time.
 *
 * The provider's timeline is the kept regions laid end to end and then sped up,
 * so this undoes the tempo first and then walks the regions, adding back every
 * second that was cut out before this point.
 *
 * A timestamp past the end of the processed audio clamps to the end of the last
 * kept region rather than running off into time that was never recorded.
 */
export function toOriginalMs(processedMs: number, timeline: Timeline): number {
  const { regions, tempo } = timeline;
  if (!regions.length) return Math.max(0, Math.round(processedMs));

  const concatenatedMs = Math.max(0, processedMs) * (tempo > 0 ? tempo : 1);

  let consumed = 0;
  for (const region of regions) {
    const duration = regionDuration(region);
    if (concatenatedMs <= consumed + duration) {
      return Math.round(region.startMs + (concatenatedMs - consumed));
    }
    consumed += duration;
  }

  return Math.round(regions.at(-1)!.endMs);
}

/** Maps a provider segment's start and end back to real time, keeping order. */
export function segmentToOriginal(
  segment: { startMilliseconds: number; endMilliseconds: number },
  timeline: Timeline,
): { startMilliseconds: number; endMilliseconds: number } {
  const startMilliseconds = toOriginalMs(segment.startMilliseconds, timeline);
  const endMilliseconds = toOriginalMs(segment.endMilliseconds, timeline);
  return {
    startMilliseconds,
    // A segment that spanned a cut lands with its end before its start once the
    // removed silence is added back. Collapsing to a point is honest: the words
    // were said, and everything after the cut belongs to the next region.
    endMilliseconds: Math.max(startMilliseconds, endMilliseconds),
  };
}
