import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  ACTION_TYPES,
  NOTE_LIMIT,
  PRIOR_KNOWLEDGE,
  USAGE_EVENTS,
  USEFULNESS,
  type ActionType,
  type FindingReview,
  type PriorKnowledge,
  type UsageEventName,
  type Usefulness,
} from "@/modules/intelligence/pilot";

/**
 * Writing the pilot records, and never letting them break a page.
 *
 * Instrumentation is the one part of a product that must not be able to take
 * the product down. A missing table, a revoked grant or a slow write here is a
 * telemetry problem; a manager reading their morning numbers should never learn
 * about it. So every write is best-effort and every failure is logged rather
 * than raised — the opposite of the rule for analytical reads, where an
 * unreported failure would render as a confident zero.
 */

function logFailure(what: string, message: string): void {
  console.warn(`ANUMA pilot telemetry could not ${what}`, { message });
}

export type UsageEventInput = {
  organizationId: string;
  membershipId: string;
  sessionId: string;
  /** One real interaction, one UUID. Retries with the same id are idempotent. */
  clientEventId: string;
  scopeFingerprint?: string | null;
  page: string;
  eventName: UsageEventName;
  objectType?: string | null;
  objectKey?: string | null;
  cohortKey?: string | null;
  conversationId?: string | null;
  filters?: Record<string, string>;
  metadata?: Record<string, string | number | boolean>;
};

export async function recordUsageEvent(input: UsageEventInput): Promise<void> {
  if (!USAGE_EVENTS.includes(input.eventName)) return;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      // The generated types predate these tables; the shape is enforced by the
      // migration's check constraints and by the input type above.
      .from("product_usage_events" as never)
      // Upsert on the client event id: a retried beacon is the same
      // interaction, and counting it twice would inflate every adoption number
      // by however flaky the network was.
      .upsert(
        {
        organization_id: input.organizationId,
        membership_id: input.membershipId,
        session_id: input.sessionId,
        client_event_id: input.clientEventId,
        scope_fingerprint: input.scopeFingerprint ?? null,
        page: input.page,
        event_name: input.eventName,
        object_type: input.objectType ?? null,
        object_key: input.objectKey ?? null,
        cohort_key: input.cohortKey ?? null,
        conversation_id: input.conversationId ?? null,
        filters: input.filters ?? {},
        metadata: input.metadata ?? {},
        } as never,
        { onConflict: "client_event_id", ignoreDuplicates: true } as never,
      );
    if (error) logFailure("record a usage event", error.message);
  } catch (failure) {
    logFailure("record a usage event", failure instanceof Error ? failure.message : "unknown");
  }
}

export type FindingReviewInput = {
  organizationId: string;
  membershipId: string;
  findingKey: string;
  cohortKey: string;
  scopeFingerprint: string;
  /** Binds the answer to the cohort as it stood when it was answered. */
  findingFingerprint: string;
  reviewed: boolean;
  usefulness: Usefulness | null;
  actionType: ActionType | null;
  wouldHaveKnownWithoutAnuma: PriorKnowledge | null;
  note: string | null;
};

/** Validated here as well as in the database: a bad value should never reach it. */
function clean(input: FindingReviewInput) {
  return {
    usefulness: input.usefulness && USEFULNESS.includes(input.usefulness) ? input.usefulness : null,
    action_type:
      input.actionType && ACTION_TYPES.includes(input.actionType) ? input.actionType : null,
    would_have_known_without_anuma:
      input.wouldHaveKnownWithoutAnuma && PRIOR_KNOWLEDGE.includes(input.wouldHaveKnownWithoutAnuma)
        ? input.wouldHaveKnownWithoutAnuma
        : null,
    note: input.note ? input.note.slice(0, NOTE_LIMIT) : null,
  };
}

export async function saveFindingReview(input: FindingReviewInput): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("management_finding_reviews" as never).upsert(
      {
        organization_id: input.organizationId,
        membership_id: input.membershipId,
        finding_key: input.findingKey,
        cohort_key: input.cohortKey,
        scope_fingerprint: input.scopeFingerprint,
        finding_fingerprint: input.findingFingerprint,
        reviewed_at: input.reviewed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        ...clean(input),
      } as never,
      {
        onConflict: "organization_id,membership_id,finding_fingerprint",
      } as never,
    );
    if (error) {
      logFailure("save a finding review", error.message);
      return false;
    }
    return true;
  } catch (failure) {
    logFailure("save a finding review", failure instanceof Error ? failure.message : "unknown");
    return false;
  }
}

/**
 * The manager's own earlier answers, so the panel opens where they left it.
 *
 * Filtered by membership as well as organization, because the sentence above
 * has to be literally true. Reading organization-wide showed one manager
 * another's private judgement of a colleague's work — and the panel presented
 * it as the reader's own previous answer.
 */
export async function readFindingReviews(
  organizationId: string,
  membershipId: string,
  scopeFingerprint: string,
): Promise<Map<string, FindingReview>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("management_finding_reviews" as never)
      .select(
        "finding_key, cohort_key, scope_fingerprint, reviewed_at, usefulness, action_type, would_have_known_without_anuma, note",
      )
      .eq("organization_id", organizationId)
      .eq("membership_id", membershipId)
      .eq("scope_fingerprint", scopeFingerprint);
    if (error) {
      logFailure("read finding reviews", error.message);
      return new Map();
    }
    const rows = (data ?? []) as unknown as {
      finding_key: string;
      cohort_key: string;
      scope_fingerprint: string;
      reviewed_at: string | null;
      usefulness: Usefulness | null;
      action_type: ActionType | null;
      would_have_known_without_anuma: PriorKnowledge | null;
      note: string | null;
    }[];
    return new Map(
      rows.map((row) => [
        `${row.finding_key}:${row.cohort_key}`,
        {
          findingKey: row.finding_key,
          cohortKey: row.cohort_key,
          scopeFingerprint: row.scope_fingerprint,
          reviewedAt: row.reviewed_at,
          usefulness: row.usefulness,
          actionType: row.action_type,
          wouldHaveKnownWithoutAnuma: row.would_have_known_without_anuma,
          note: row.note,
        },
      ]),
    );
  } catch (failure) {
    logFailure("read finding reviews", failure instanceof Error ? failure.message : "unknown");
    return new Map();
  }
}
