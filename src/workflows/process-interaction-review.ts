import { createAdminClient } from "@/lib/supabase/admin";
import { processInteractionReview } from "@/modules/review/processing";

export async function processInteractionReviewWorkflow(reviewRunId: string) {
  "use workflow";
  try {
    await processInteractionReview(reviewRunId);
    return { status: "completed" as const };
  } catch (error) {
    const db = createAdminClient();
    await db
      .from("review_runs")
      .update({
        completed_at: new Date().toISOString(),
        error_code: "review_failed",
        error_message: error instanceof Error ? error.message : "Interaction review failed.",
        status: "failed",
      })
      .eq("id", reviewRunId);
    return { status: "failed" as const };
  }
}
