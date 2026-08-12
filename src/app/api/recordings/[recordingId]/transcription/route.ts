import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processTranscriptionRun } from "@/workflows/process-transcription-run";

type RouteContext = { params: Promise<{ recordingId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { recordingId } = await params;
  if (!z.string().uuid().safeParse(recordingId).success) {
    return NextResponse.json({ error: "The recording identifier is invalid." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: runId, error } = await supabase.rpc("request_transcription_run", {
    p_recording_id: recordingId,
  });
  if (error || !runId) {
    console.error("Transcription request failed", { code: error?.code, message: error?.message });
    return NextResponse.json(
      {
        error:
          error?.code === "23505"
            ? "Transcription is already running for this audio."
            : "Transcription could not be requested.",
      },
      { status: error?.code === "42501" ? 403 : 400 },
    );
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
    return NextResponse.json(
      { error: "Durable transcription processing could not be started." },
      { status: 503 },
    );
  }
  return NextResponse.json({ transcriptionRunId: runId, status: "pending" }, { status: 202 });
}
