import "server-only";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ffmpegPath from "ffmpeg-static";

import {
  normalizeRegions,
  speechFromSilence,
  totalSpeechMs,
  type SpeechRegion,
  type Timeline,
} from "@/modules/transcription/audio-timeline";

/**
 * Removes silence from a recording before it is sent for transcription.
 *
 * The provider bills every second submitted, and a shop-floor recording is
 * mostly not speech — the microphone runs while the representative walks to the
 * shelf, while the customer reads a spec sheet, while nobody says anything at
 * all. Those seconds cost exactly as much as the ones containing a price.
 *
 * The original object in storage is never touched. This produces a derived
 * copy for the provider plus the timeline needed to translate its timestamps
 * back, so playback, metrics and evidence all still refer to the recording a
 * person can actually listen to.
 */

/**
 * Quieter than this, for longer than this, counts as silence.
 *
 * Measured against real recordings from this product rather than chosen from a
 * reference: their mean volume is about -23 dB, because a shop floor has a
 * constant noise bed of air conditioning, music and other people. There is very
 * little true silence in them.
 *
 * A sweep over those recordings put -45 dB at under 1% removable and -26 dB at
 * around 16% — but -26 dB is only three decibels below the mean, which cuts
 * quiet speech, and the first word after a cut is very often the one carrying
 * the price. -35 dB sits about twelve decibels below the noise bed and removed
 * roughly 11% of audio consistently across files, which is the honest ceiling
 * for this technique on this material.
 */
const SILENCE_THRESHOLD_DB = -35;
const MIN_SILENCE_SECONDS = 0.8;
/**
 * Kept either side of detected speech, so cuts never land on a consonant.
 *
 * Paid for out of the saving: at 150 ms each side a 0.8 s gap yields only 0.5 s.
 * That is the intended trade — the entity features depend on the words next to
 * the cuts, not on the seconds between them.
 */
const REGION_PAD_MS = 150;
/** Below this saving, re-encoding costs more than the seconds it removes. */
const MIN_WORTHWHILE_SAVING = 0.05;

const OUTPUT_SAMPLE_RATE = 16_000;
const OUTPUT_BITRATE = "64k";

export type PreprocessResult = {
  audio: Uint8Array;
  timeline: Timeline;
  originalDurationMs: number;
  processedDurationMs: number;
  /** True when the original was returned untouched. */
  passthrough: boolean;
};

function ffmpegBinary(): string {
  // ffmpeg-static resolves to the binary for the platform it was installed on.
  // A system ffmpeg is the fallback for environments where it is absent.
  return ffmpegPath ?? "ffmpeg";
}

function run(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/**
 * Silence intervals as reported by ffmpeg's `silencedetect`.
 *
 * The filter writes to stderr rather than producing output, so the intervals
 * are parsed from its log lines. A `silence_start` without a matching end means
 * the recording finished while still silent.
 */
function parseSilences(stderr: string, durationMs: number): SpeechRegion[] {
  const silences: SpeechRegion[] = [];
  let openedAt: number | null = null;

  for (const line of stderr.split("\n")) {
    const start = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (start) {
      openedAt = Math.max(0, Number.parseFloat(start[1]!) * 1000);
      continue;
    }
    const end = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (end && openedAt !== null) {
      silences.push({ startMs: openedAt, endMs: Number.parseFloat(end[1]!) * 1000 });
      openedAt = null;
    }
  }
  if (openedAt !== null) silences.push({ startMs: openedAt, endMs: durationMs });

  return silences;
}

/** An ffmpeg `aselect` expression keeping only the given regions. */
function selectExpression(regions: readonly SpeechRegion[]): string {
  return regions
    .map(
      (region) =>
        `between(t,${(region.startMs / 1000).toFixed(3)},${(region.endMs / 1000).toFixed(3)})`,
    )
    .join("+");
}

export async function preprocessAudio(input: {
  audio: Uint8Array;
  durationMs: number;
  fileName: string;
  tempo?: number;
}): Promise<PreprocessResult> {
  const tempo = input.tempo && input.tempo > 0 ? input.tempo : 1;
  const workingDirectory = await mkdtemp(join(tmpdir(), "anuma-audio-"));
  const sourcePath = join(workingDirectory, input.fileName || `${randomUUID()}.audio`);
  const outputPath = join(workingDirectory, `${randomUUID()}.m4a`);

  const untouched: PreprocessResult = {
    audio: input.audio,
    timeline: { regions: [], tempo: 1 },
    originalDurationMs: input.durationMs,
    processedDurationMs: input.durationMs,
    passthrough: true,
  };

  try {
    await writeFile(sourcePath, input.audio);

    const detection = await run([
      "-hide_banner",
      "-nostats",
      "-i",
      sourcePath,
      "-af",
      `silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:d=${MIN_SILENCE_SECONDS}`,
      "-f",
      "null",
      "-",
    ]);
    if (detection.code !== 0) return untouched;

    const silences = parseSilences(detection.stderr, input.durationMs);
    const regions = normalizeRegions(speechFromSilence(silences, input.durationMs), {
      padMs: REGION_PAD_MS,
      durationMs: input.durationMs,
    });

    // Nothing detectable to keep. Send the original rather than an empty file:
    // a recording that reads as pure silence to a threshold is still the only
    // evidence there is, and the provider may hear what the filter did not.
    if (!regions.length) return untouched;

    const speechMs = totalSpeechMs(regions);
    const saving = 1 - speechMs / Math.max(1, input.durationMs);
    if (saving < MIN_WORTHWHILE_SAVING && tempo === 1) return untouched;

    const filters = [`aselect='${selectExpression(regions)}'`, "asetpts=N/SR/TB"];
    if (tempo !== 1) filters.push(`atempo=${tempo.toFixed(3)}`);

    const trim = await run([
      "-hide_banner",
      "-nostats",
      "-i",
      sourcePath,
      "-af",
      filters.join(","),
      "-ac",
      "1",
      "-ar",
      String(OUTPUT_SAMPLE_RATE),
      "-c:a",
      "aac",
      "-b:a",
      OUTPUT_BITRATE,
      "-y",
      outputPath,
    ]);
    if (trim.code !== 0) return untouched;

    const audio = new Uint8Array(await readFile(outputPath));
    if (!audio.byteLength) return untouched;

    return {
      audio,
      timeline: { regions, tempo },
      originalDurationMs: input.durationMs,
      processedDurationMs: Math.round(speechMs / tempo),
      passthrough: false,
    };
  } catch {
    // Preprocessing is an optimization. If it cannot run — no binary, no
    // temp space, an unexpected container — the recording must still be
    // transcribed, just without the saving.
    return untouched;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true }).catch(() => {});
  }
}
