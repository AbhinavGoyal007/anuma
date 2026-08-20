"use server";

import { revalidatePath } from "next/cache";

import { scopeFingerprint, findingFingerprint } from "@/modules/intelligence/canonical";
import { FILTER_PARAM_KEYS } from "@/modules/intelligence/filters";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import {
  ACTION_TYPES,
  PRIOR_KNOWLEDGE,
  USEFULNESS,
  type ActionType,
  type PriorKnowledge,
  type Usefulness,
} from "@/modules/intelligence/pilot";
import { recordUsageEvent, saveFindingReview } from "@/modules/intelligence/pilot-store";
import {
  REVIEWABLE_PAGES,
  resolveReviewableFinding,
  type ReviewablePage,
} from "@/modules/intelligence/reviewable";
import { ensureSessionId } from "@/modules/intelligence/session";

/**
 * Recording what a manager decided about a finding.
 *
 * Nothing analytical is taken from the form. A hidden field is browser-owned:
 * it can be edited, replayed, or pointed at a cohort the page never showed. So
 * the action re-resolves the population from the filter parameters, asks the
 * same registry the page used which findings were reviewable, and recomputes
 * both fingerprints server-side. The form may say which control was answered
 * and what the answer was; it may not say what that control meant.
 *
 * Identity comes from the session, never from the payload — otherwise one
 * member could file their judgement under a colleague's name.
 */
export async function saveReviewOutcome(formData: FormData): Promise<void> {
  const read = (key: string): string | null => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const oneOf = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    const value = read(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  };

  const page = oneOf<ReviewablePage>("page", REVIEWABLE_PAGES);
  const cohortKey = read("cohort_key");
  if (!page || !cohortKey) return;

  // Only the population filters are read back, and only through the same parser
  // the pages use. Anything else in the form is ignored.
  const raw: Record<string, string> = {};
  for (const key of FILTER_PARAM_KEYS) {
    const value = read(key);
    if (value) raw[key] = value;
  }
  const journeyCohortRaw = read("cohort");
  if (journeyCohortRaw) raw.cohort = journeyCohortRaw;

  const resolved = await resolveIntelligencePage(raw);
  if ("redirect" in resolved) return;

  const finding = resolveReviewableFinding(
    page,
    cohortKey,
    resolved.current.rows,
    page === "journey" ? "all" : "all",
  );
  // An unknown finding is refused outright rather than stored against a cohort
  // the product never offered.
  if (!finding) return;

  const scope = scopeFingerprint({
    from: resolved.periods.current.from,
    to: resolved.periods.current.to,
    filters: Object.fromEntries(FILTER_PARAM_KEYS.map((key) => [key, raw[key] ?? null])),
  });
  const fingerprint = findingFingerprint({
    scopeFingerprint: scope,
    page,
    findingKey: finding.findingKey,
    cohortKey: finding.cohortKey,
    recordIds: finding.recordIds,
  });

  const usefulness = oneOf<Usefulness>("usefulness", USEFULNESS);
  const actionType = oneOf<ActionType>("action_type", ACTION_TYPES);
  const priorKnowledge = oneOf<PriorKnowledge>("prior_knowledge", PRIOR_KNOWLEDGE);

  const saved = await saveFindingReview({
    organizationId: resolved.organizationId,
    membershipId: resolved.membershipId,
    findingKey: finding.findingKey,
    cohortKey: finding.cohortKey,
    scopeFingerprint: scope,
    findingFingerprint: fingerprint,
    reviewed: true,
    usefulness,
    actionType,
    wouldHaveKnownWithoutAnuma: priorKnowledge,
    note: read("note"),
  });
  if (!saved) return;

  const sessionId = await ensureSessionId();
  const base = {
    organizationId: resolved.organizationId,
    membershipId: resolved.membershipId,
    sessionId,
    scopeFingerprint: scope,
    page,
    objectType: "finding",
    objectKey: finding.findingKey,
    cohortKey: finding.cohortKey,
  } as const;

  await recordUsageEvent({
    ...base,
    clientEventId: crypto.randomUUID(),
    eventName: "finding_reviewed",
  });
  if (usefulness) {
    await recordUsageEvent({
      ...base,
      clientEventId: crypto.randomUUID(),
      eventName: "finding_usefulness_saved",
    });
  }
  if (actionType) {
    await recordUsageEvent({
      ...base,
      clientEventId: crypto.randomUUID(),
      eventName: "management_action_saved",
    });
  }

  // Allowlisted: a return path is browser-supplied and must not be able to send
  // a revalidation anywhere it likes.
  const path = read("return_path");
  if (path && /^\/intelligence\/[a-z-]+$/.test(path)) revalidatePath(path);
}
