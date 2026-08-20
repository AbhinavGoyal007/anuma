import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  computePilotMetrics,
  type PilotEventRow,
  type PilotMetrics,
  type PilotReviewRow,
} from "@/modules/intelligence/pilot";

/**
 * Reading the two pilot tables.
 *
 * The arithmetic lives beside the definitions in `pilot.ts` so it can be tested
 * on fixtures; this file only fetches. A failure returns null rather than
 * throwing: an internal report being unavailable must never take a page with
 * it.
 *
 * This is an organization-wide management report: it says how many managers
 * used Intelligence and what they judged the findings to be worth, across
 * everyone. A representative or a manager reading it would be reading their
 * colleagues' adoption and their colleagues' private answers, so it is
 * admin-only. Row-level security enforces the same thing independently, which
 * is why the check here returns null rather than a self-only report: a report
 * labelled organization-wide that quietly contained one row would be worse than
 * no report.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function loadPilotMetrics(
  organizationId: string,
  now: Date = new Date(),
): Promise<PilotMetrics | null> {
  try {
    const current = (await getApplicationContext())?.current;
    if (
      !current ||
      current.membership.role !== "admin" ||
      current.organization.id !== organizationId
    ) {
      return null;
    }
    const supabase = await createClient();
    const since = new Date(now.getTime() - 2 * WEEK_MS).toISOString();
    const [events, reviews] = await Promise.all([
      supabase
        .from("product_usage_events" as never)
        .select("membership_id, session_id, occurred_at, event_name, cohort_key")
        .eq("organization_id", organizationId)
        .gte("occurred_at", since),
      supabase
        .from("management_finding_reviews" as never)
        .select("membership_id, usefulness, action_type, reviewed_at")
        .eq("organization_id", organizationId),
    ]);
    if (events.error || reviews.error) return null;
    return computePilotMetrics(
      (events.data ?? []) as unknown as PilotEventRow[],
      (reviews.data ?? []) as unknown as PilotReviewRow[],
      now,
    );
  } catch {
    return null;
  }
}
