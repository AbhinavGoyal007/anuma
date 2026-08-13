/**
 * Transcribing the evaluation set through Sarvam, exactly as the product does.
 *
 * The incumbent has to be measured on the same audio as everything else or the
 * comparison is worthless — and it was, until now: Sarvam had only ever run on
 * the four scripts that happened to be uploaded through the app, while the
 * challengers ran on all thirteen. On those four it scored 29/29 against
 * Voxtral's 28/29, so the question of whether it holds up on the other nine —
 * including both Hindi ones — decides whether the case for switching is about
 * accuracy or purely about cost.
 *
 * The job parameters are copied from `sarvam-provider.ts` rather than chosen:
 * a different mode or language setting would be measuring a different product.
 *
 * This spends money — roughly ₹45 per audio-hour at the rate this evaluation is
 * trying to escape.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/run-sarvam-baseline.mts --audio eval/audio2 --out eval/out2/sarvam-13
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { SarvamAIClient } from "sarvamai";

const { values } = parseArgs({
  options: {
    audio: { type: "string", default: "eval/audio2" },
    out: { type: "string", default: "eval/out2/sarvam-13" },
  },
});

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) {
  console.error("SARVAM_API_KEY is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const client = new SarvamAIClient({
  apiSubscriptionKey: apiKey,
  timeoutInSeconds: 120,
  maxRetries: 2,
});

type Manifest = { recordings: { file: string; title: string; durationMs: number }[] };
const manifest: Manifest = JSON.parse(
  await readFile(join(values.audio!, "manifest.json"), "utf8"),
);
await mkdir(values.out!, { recursive: true });

/** Poll rather than assume: a four-minute file takes tens of seconds. */
async function waitForCompletion(jobId: string): Promise<string[]> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await client.speechToTextJob.getStatus(jobId);
    if (status.job_state === "Completed") {
      return (status.job_details ?? []).flatMap((detail) =>
        (detail.outputs ?? []).flatMap((o) => (o.file_name ? [o.file_name] : [])),
      );
    }
    if (status.job_state === "Failed") {
      throw new Error(status.error_message ?? "Sarvam reported the job as failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Sarvam did not finish within ten minutes.");
}

/**
 * The spoken text, however this response shape carries it.
 *
 * Sarvam returns diarized entries for a code-mixed job, but the wrapper has
 * changed shape before, so the transcript is gathered from whichever field is
 * present rather than from one assumed path.
 */
function extractText(payload: unknown): string {
  const seen: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      for (const key of ["transcript", "text", "content"]) {
        if (typeof record[key] === "string" && record[key].trim()) {
          seen.push(record[key].trim());
          return;
        }
      }
      Object.values(record).forEach(walk);
    }
  };
  walk(payload);
  return seen.join(" ");
}

let billableSeconds = 0;

for (const record of manifest.recordings) {
  const startedAt = Date.now();
  try {
    const job = await client.speechToTextJob.initialise({
      job_parameters: {
        model: "saaras:v3",
        mode: "codemix",
        language_code: "unknown",
        with_diarization: true,
        with_timestamps: true,
      },
    });
    const links = await client.speechToTextJob.getUploadLinks({
      job_id: job.job_id,
      files: [record.file],
    });
    const upload = links.upload_urls[record.file];
    if (!upload?.file_url) throw new Error("no upload URL");

    const audio = await readFile(join(values.audio!, record.file));
    const put = await fetch(upload.file_url, {
      method: "PUT",
      headers: { "Content-Type": "audio/wav", "x-ms-blob-type": "BlockBlob" },
      body: audio,
    });
    if (!put.ok) throw new Error(`upload failed (${put.status})`);

    await client.speechToTextJob.start(job.job_id);
    const outputs = await waitForCompletion(job.job_id);

    const downloads = await client.speechToTextJob.getDownloadLinks({
      job_id: job.job_id,
      files: outputs,
    });
    const first = downloads.download_urls[outputs[0]!];
    if (!first?.file_url) throw new Error("no transcript URL");
    const payload = await (await fetch(first.file_url)).json();

    const text = extractText(payload);
    const audioSeconds = record.durationMs / 1000;
    billableSeconds += audioSeconds;

    await writeFile(
      join(values.out!, `${record.file}.json`),
      JSON.stringify(
        {
          model: "sarvam/saaras:v3",
          tag: "sarvam-13",
          file: record.file,
          title: record.title,
          audioSeconds: Math.round(audioSeconds * 10) / 10,
          wallSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
          realtimeFactor:
            Math.round((audioSeconds / ((Date.now() - startedAt) / 1000)) * 10) / 10,
          segments: [],
          text,
          raw: payload,
        },
        null,
        1,
      ),
    );
    console.log(
      `  ${record.title.padEnd(10)} ${(audioSeconds / 60).toFixed(1)}min  ` +
        `${((Date.now() - startedAt) / 1000).toFixed(0)}s  ${text.length} chars`,
    );
  } catch (error) {
    console.error(
      `  ${record.title.padEnd(10)} FAILED: ${error instanceof Error ? error.message : error}`,
    );
  }
}

console.log(
  `\nSubmitted ${(billableSeconds / 60).toFixed(1)} minutes — about ₹${((billableSeconds / 3600) * 45.5).toFixed(0)} at the measured rate.`,
);
