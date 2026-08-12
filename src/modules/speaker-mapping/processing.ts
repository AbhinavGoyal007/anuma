import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { autoMapSpeakers } from "@/modules/speaker-mapping/auto-map";

/**
 * Maps speakers automatically as a durable workflow step, and reports the
 * conversation so the caller can build its record next.
 *
 * A mapping failure returns null rather than throwing: the transcript is the
 * expensive artifact and must survive even when role identification stumbles,
 * so a failed map leaves the conversation unmapped and recoverable instead of
 * failing the whole run.
 */
export async function autoMapSpeakersStep(transcriptionRunId: string): Promise<string | null> {
  "use step";

  const db = createAdminClient();
  const { data: run } = await db
    .from("transcription_runs")
    .select("conversation_id")
    .eq("id", transcriptionRunId)
    .maybeSingle();
  if (!run?.conversation_id) return null;

  try {
    const result = await autoMapSpeakers(transcriptionRunId);
    console.info("Automatic speaker mapping", {
      transcriptionRunId,
      representative: result.representative,
      confidence: result.confidence,
      agreed: result.agreed,
    });
    return result.mappingVersionId ? run.conversation_id : null;
  } catch (error) {
    console.error("Automatic speaker mapping failed", {
      transcriptionRunId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
