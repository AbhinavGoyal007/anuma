import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildInteractionRecordWorkflow } from "@/workflows/build-interaction-record";

const entrySchema = z.object({
  providerSpeakerIdentifier: z.string().trim().min(1).max(120),
  participantRole: z.enum([
    "representative",
    "customer",
    "additional_customer",
    "manager",
    "unknown",
  ]),
  participantId: z.string().uuid().nullable(),
});
const requestSchema = z.object({ entries: z.array(entrySchema).min(1).max(20) });
type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { runId } = await params;
  const payload = requestSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(runId).success || !payload.success) {
    return NextResponse.json({ error: "The speaker mapping is invalid." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_speaker_mapping_version", {
    p_transcription_run_id: runId,
    p_entries: payload.data.entries,
  });
  if (error || !data) {
    console.error("Speaker mapping save failed", { code: error?.code, message: error?.message });
    return NextResponse.json(
      { error: "Speaker mapping could not be saved for this transcript." },
      { status: error?.code === "42501" ? 403 : 400 },
    );
  }

  // Confirming who spoke is the trigger: only now can a budget be attributed to
  // the customer and a quote to the representative. The build runs durably and
  // out of band, so a slow extraction never holds up saving the mapping — and a
  // failure to schedule it is logged, not surfaced, because the mapping itself
  // succeeded and the record can be rebuilt.
  const { data: run } = await createAdminClient()
    .from("transcription_runs")
    .select("conversation_id")
    .eq("id", runId)
    .maybeSingle();
  if (run?.conversation_id) {
    try {
      await start(buildInteractionRecordWorkflow, [run.conversation_id]);
    } catch (workflowError) {
      console.error("Interaction record build could not be scheduled", {
        conversationId: run.conversation_id,
        message: workflowError instanceof Error ? workflowError.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ mappingVersionId: data });
}
