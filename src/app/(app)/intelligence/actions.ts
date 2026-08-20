"use server";

import { revalidatePath } from "next/cache";

import { getApplicationContext } from "@/modules/identity/application-context";
import {
  ACTION_TYPES,
  PRIOR_KNOWLEDGE,
  USEFULNESS,
  type ActionType,
  type PriorKnowledge,
  type Usefulness,
} from "@/modules/intelligence/pilot";
import { recordUsageEvent, saveFindingReview } from "@/modules/intelligence/pilot-store";

/**
 * Recording what a manager decided about a finding.
 *
 * The organization and membership come from the session, never from the form:
 * a hidden field naming somebody else would let one member attribute their
 * judgement to a colleague, and every pilot metric about adoption would become
 * unfalsifiable.
 */
export async function saveReviewOutcome(formData: FormData): Promise<void> {
  const context = await getApplicationContext();
  if (!context?.current) return;

  const read = (key: string): string | null => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const oneOf = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    const value = read(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  };

  const findingKey = read("finding_key");
  const cohortKey = read("cohort_key");
  const scope = read("scope_hash");
  if (!findingKey || !cohortKey || !scope) return;

  const organizationId = context.current.organization.id;
  const membershipId = context.current.membership.id;
  const usefulness = oneOf<Usefulness>("usefulness", USEFULNESS);
  const actionType = oneOf<ActionType>("action_type", ACTION_TYPES);
  const priorKnowledge = oneOf<PriorKnowledge>("prior_knowledge", PRIOR_KNOWLEDGE);

  const saved = await saveFindingReview({
    organizationId,
    membershipId,
    findingKey,
    cohortKey,
    scopeHash: scope,
    reviewed: true,
    usefulness,
    actionType,
    wouldHaveKnownWithoutAnuma: priorKnowledge,
    note: read("note"),
  });
  if (!saved) return;

  const base = {
    organizationId,
    membershipId,
    sessionId: scope,
    page: read("page") ?? "intelligence",
    objectType: "finding",
    objectKey: findingKey,
    cohortKey,
  } as const;

  await recordUsageEvent({ ...base, eventName: "finding_reviewed" });
  if (usefulness) await recordUsageEvent({ ...base, eventName: "finding_usefulness_saved" });
  if (actionType) await recordUsageEvent({ ...base, eventName: "management_action_saved" });

  const path = read("return_path");
  if (path?.startsWith("/intelligence/")) revalidatePath(path);
}
