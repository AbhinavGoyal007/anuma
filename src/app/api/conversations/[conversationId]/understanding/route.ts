import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processAnalysisRunWorkflow } from "@/workflows/process-analysis-run";
type Context = { params: Promise<{ conversationId: string }> };
export async function POST(_request: Request, { params }: Context) {
  const { conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success)
    return NextResponse.json({ error: "Invalid interaction." }, { status: 400 });
  const db = await createClient();
  const { data, error } = await db.rpc("request_interaction_understanding", {
    p_conversation_id: conversationId,
  });
  if (error || !data) {
    console.error("Understanding request failed", { code: error?.code, message: error?.message });
    return NextResponse.json(
      {
        error:
          error?.code === "23505"
            ? "Interaction understanding is already running."
            : "Understanding could not start for this interaction.",
      },
      { status: error?.code === "42501" ? 403 : 400 },
    );
  }
  try {
    await start(processAnalysisRunWorkflow, [data]);
  } catch (workflowError) {
    console.error("Understanding workflow could not start", {
      message: workflowError instanceof Error ? workflowError.message : "Unknown error",
      runId: data,
    });
    await createAdminClient()
      .from("analysis_runs")
      .update({
        completed_at: new Date().toISOString(),
        error_code: "workflow_start_failed",
        error_message: "Durable interaction understanding could not be started.",
        status: "failed",
      })
      .eq("id", data)
      .eq("status", "pending");
    return NextResponse.json(
      { error: "Understanding could not be scheduled. You can try again." },
      { status: 503 },
    );
  }
  return NextResponse.json({ analysisRunId: data, status: "pending" }, { status: 202 });
}
