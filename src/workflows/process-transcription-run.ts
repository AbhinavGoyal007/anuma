import { sleep } from "workflow";

import { buildInteractionRecord } from "@/modules/interaction-record/persistence";
import { autoMapSpeakersStep } from "@/modules/speaker-mapping/processing";
import { MAX_POLL_ATTEMPTS, pollDelayMs } from "@/modules/transcription/poll-schedule";
import {
  failTranscriptionStep,
  persistTranscriptStep,
  pollTranscriptionStep,
  submitTranscriptionStep,
} from "@/modules/transcription/processing";

function safeError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "Processing could not be completed.";
}

/**
 * Everything that follows a landed transcript, with no human in between.
 *
 * Speakers are mapped automatically and, if that succeeds, the interaction
 * record is built from the mapped transcript. Both are best-effort: the
 * transcript is already saved and valuable on its own, so a failure here leaves
 * it intact rather than failing the run.
 */
async function finishTranscription(transcriptionRunId: string): Promise<void> {
  const conversationId = await autoMapSpeakersStep(transcriptionRunId);
  if (conversationId) await buildInteractionRecord(conversationId);
}

/** Durable polling is used because Sarvam's Batch callback only signals completion;
 * the actual transcript still requires a protected result download. */
export async function processTranscriptionRun(transcriptionRunId: string) {
  "use workflow";

  try {
    const submission = await submitTranscriptionStep(transcriptionRunId);
    // Too little audio to be worth a provider call. The run has already been
    // closed out as cancelled, so there is nothing left to poll for.
    if (submission.state === "skipped") {
      return { status: "skipped" as const, reason: submission.reason };
    }
    // An immediate provider already has the transcript, so there is no job to
    // wait on and no polling to pay for.
    if (submission.state === "transcribed") {
      await persistTranscriptStep(
        transcriptionRunId,
        { kind: "immediate", transcript: submission.transcript },
        submission.timeline,
      );
      await finishTranscription(transcriptionRunId);
      return { status: "completed" as const };
    }
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const status = await pollTranscriptionStep(transcriptionRunId);
      if (status.state === "completed") {
        await persistTranscriptStep(
          transcriptionRunId,
          {
            kind: "batch",
            providerRequestId: status.providerRequestId,
            outputFileNames: status.outputFileNames,
          },
          submission.timeline,
        );
        await finishTranscription(transcriptionRunId);
        return { status: "completed" as const };
      }
      if (status.state === "failed") {
        await failTranscriptionStep(
          transcriptionRunId,
          status.message ?? "Sarvam marked the job as failed.",
        );
        return { status: "failed" as const };
      }
      await sleep(pollDelayMs(attempt));
    }
    await failTranscriptionStep(
      transcriptionRunId,
      "Sarvam did not complete within the three-hour processing window.",
    );
    return { status: "timed_out" as const };
  } catch (error) {
    await failTranscriptionStep(transcriptionRunId, safeError(error));
    return { status: "failed" as const };
  }
}
