import { processAnalysisRun } from "@/modules/analysis/processing";
import { createAdminClient } from "@/lib/supabase/admin";

export async function processAnalysisRunWorkflow(runId: string) {
  "use workflow";
  try {
    await processAnalysisRun(runId);
    return { status: "completed" as const };
  } catch (error) {
    const db = createAdminClient();
    await db
      .from("analysis_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: "analysis_failed",
        error_message: error instanceof Error ? error.message : "Analysis failed.",
      })
      .eq("id", runId);
    return { status: "failed" as const };
  }
}
