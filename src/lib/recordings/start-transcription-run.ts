import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { start } from "workflow/api";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.generated";
import { processTranscriptionRun } from "@/workflows/process-transcription-run";

/**
 * Requests a transcription run and starts its durable workflow.
 *
 * This is the browser route's sequence, lifted so that a second caller can
 * reuse it rather than copy it. `client` decides who the caller is — cookies on
 * the web, a bearer token on mobile — and RLS decides what they may do, so this
 * function never needs to know which one it has.
 */

export type StartTranscriptionResult =
  | { ok: true; runId: string }
  | { ok: false; status: number; error: string; alreadyRunning?: boolean };

export async function startTranscriptionRun(
  client: SupabaseClient<Database>,
  recordingId: string,
): Promise<StartTranscriptionResult> {
  const { data: runId, error } = await client.rpc("request_transcription_run", {
    p_recording_id: recordingId,
  });

  if (error || !runId) {
    console.error("Transcription request failed", { code: error?.code, message: error?.message });
    return {
      ok: false,
      status: error?.code === "42501" ? 403 : 400,
      error:
        error?.code === "23505"
          ? "Transcription is already running for this audio."
          : "Transcription could not be requested.",
      // The browser reports this as a 400 like any other refusal, which is fine
      // for someone reading a message on screen. A retrying upload queue needs
      // to tell it apart from a real failure, so it is flagged rather than
      // inferred from the message text.
      alreadyRunning: error?.code === "23505",
    };
  }

  try {
    const workflowRun = await start(processTranscriptionRun, [runId]);
    await createAdminClient()
      .from("transcription_runs")
      .update({ workflow_run_id: workflowRun.runId })
      .eq("id", runId)
      .eq("status", "pending");
  } catch {
    // Do not leave an apparently pending run if durable orchestration cannot be started.
    await failRun(runId);
    return {
      ok: false,
      status: 503,
      error: "Durable transcription processing could not be started.",
    };
  }

  return { ok: true, runId };
}

async function failRun(runId: string) {
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("transcription_runs")
    .select("conversation_id, organization_id")
    .eq("id", runId)
    .maybeSingle();

  await admin
    .from("transcription_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_code: "workflow_start_failed",
      error_message: "Durable transcription processing could not be started.",
    })
    .eq("id", runId)
    .eq("status", "pending");

  if (run) {
    await admin
      .from("conversations")
      .update({ lifecycle_status: "failed" })
      .eq("id", run.conversation_id)
      .eq("organization_id", run.organization_id);
  }
}
