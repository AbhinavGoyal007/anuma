import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const AUDIO_BUCKET = "conversation-audio";

/**
 * How long source audio is kept after a recording is finalized.
 *
 * Audio is the largest thing this product stores and the only thing it stores
 * that never stops growing: every conversation adds a few megabytes and nothing
 * ever removes them. Left alone the bill rises forever, and so does the amount
 * of identifiable voice data sitting in a bucket — which under the DPDP Act is
 * the harder of the two problems.
 *
 * The transcript is the durable artifact. Audio exists to be listened to while
 * someone confirms who was speaking and to settle disputes about what was said,
 * and both of those happen within days.
 */
const DEFAULT_RETENTION_DAYS = 90;
/** Storage removals per invocation, so one run cannot time out mid-sweep. */
const BATCH_SIZE = 200;

export type RetentionResult = {
  deleted: number;
  failed: number;
  cutoff: string;
};

/**
 * Deletes stored audio past the retention window.
 *
 * Idempotent and resumable: the rows are re-read each run, objects are removed
 * before the row is marked, and a row already marked `deleted` is never
 * revisited. A crash halfway leaves some objects gone and their rows unmarked,
 * which the next run simply repeats — removing an object that is already absent
 * is not an error.
 */
export async function purgeExpiredAudio(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<RetentionResult> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error } = await admin
    .from("recordings")
    .select("id, storage_object_path")
    .in("status", ["uploaded", "failed"])
    .lt("finalized_at", cutoff)
    .limit(BATCH_SIZE);

  if (error) throw new Error(`Expired audio could not be listed: ${error.message}`);
  if (!expired?.length) return { deleted: 0, failed: 0, cutoff };

  const paths = expired.map((recording) => recording.storage_object_path);
  const { error: removeError } = await admin.storage.from(AUDIO_BUCKET).remove(paths);
  if (removeError) {
    // Leave the rows untouched so the next run retries them. Marking them
    // deleted here would strand the objects with nothing left pointing at them.
    return { deleted: 0, failed: expired.length, cutoff };
  }

  const { error: markError } = await admin
    .from("recordings")
    .update({ status: "deleted" })
    .in(
      "id",
      expired.map((recording) => recording.id),
    );
  if (markError) throw new Error(`Deleted audio could not be marked: ${markError.message}`);

  return { deleted: expired.length, failed: 0, cutoff };
}
