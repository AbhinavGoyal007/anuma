import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processInteractionReviewWorkflow } from "@/workflows/process-interaction-review";

const bodySchema = z.object({
  trigger: z.enum(["initial", "correction", "configuration_change", "manual"]).default("initial"),
});
type Context = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ error: "Invalid interaction." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid review request." }, { status: 400 });

  const db = await createClient();
  const { data, error } = await db.rpc("request_interaction_review", {
    p_conversation_id: conversationId,
    p_trigger_reason: parsed.data.trigger,
  });
  if (error || !data) {
    console.error("Review request failed", { code: error?.code, message: error?.message });
    return NextResponse.json(
      {
        error:
          error?.code === "23505"
            ? "Interaction review is already running."
            : "Interaction review could not start for this interaction.",
      },
      { status: error?.code === "42501" ? 403 : 400 },
    );
  }
  try {
    await start(processInteractionReviewWorkflow, [data]);
  } catch (workflowError) {
    console.error("Review workflow could not start", {
      message: workflowError instanceof Error ? workflowError.message : "Unknown error",
      runId: data,
    });
    await createAdminClient()
      .from("review_runs")
      .update({
        completed_at: new Date().toISOString(),
        error_code: "workflow_start_failed",
        error_message: "Durable interaction review could not be started.",
        status: "failed",
      })
      .eq("id", data)
      .eq("status", "pending");
    return NextResponse.json(
      { error: "Interaction review could not be scheduled. You can try again." },
      { status: 503 },
    );
  }
  return NextResponse.json({ reviewRunId: data, status: "pending" }, { status: 202 });
}
