import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two writes and the one read that carry the pilot's meaning.
 *
 * Each of these had a defect that would not have shown up as an error. A
 * retried beacon counted twice inflates every adoption figure by however flaky
 * the network was. A review read organization-wide shows one manager another's
 * private judgement of a colleague's work — and the panel labels it as the
 * reader's own earlier answer.
 */

const calls: {
  table: string;
  payload: Record<string, unknown>;
  options?: Record<string, unknown>;
  filters: [string, unknown][];
}[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const record = { table, payload: {}, options: undefined, filters: [] as [string, unknown][] };
      calls.push(record);
      const builder = {
        upsert(payload: Record<string, unknown>, options?: Record<string, unknown>) {
          record.payload = payload;
          record.options = options;
          return Promise.resolve({ error: null });
        },
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          record.filters.push([column, value]);
          return Object.assign(Promise.resolve({ data: [], error: null }), builder);
        },
      };
      return builder;
    },
  }),
}));

const { readFindingReviews, recordUsageEvent, saveFindingReview } = await import(
  "@/modules/intelligence/pilot-store"
);

beforeEach(() => {
  calls.length = 0;
});

describe("recording an interaction", () => {
  it("is idempotent on the client event id, so a retry is the same interaction", async () => {
    await recordUsageEvent({
      organizationId: "org",
      membershipId: "m1",
      sessionId: "11111111-1111-4111-8111-111111111111",
      clientEventId: "22222222-2222-4222-8222-222222222222",
      scopeFingerprint: "scope",
      page: "overview",
      eventName: "priority_action_opened",
    });
    expect(calls[0]!.table).toBe("product_usage_events");
    expect(calls[0]!.options).toMatchObject({
      onConflict: "client_event_id",
      ignoreDuplicates: true,
    });
    expect(calls[0]!.payload).toMatchObject({
      client_event_id: "22222222-2222-4222-8222-222222222222",
      membership_id: "m1",
      scope_fingerprint: "scope",
    });
  });

  it("refuses a name the database would reject rather than losing the row quietly", async () => {
    await recordUsageEvent({
      organizationId: "org",
      membershipId: "m1",
      sessionId: "11111111-1111-4111-8111-111111111111",
      clientEventId: "22222222-2222-4222-8222-222222222222",
      page: "overview",
      // Removed with the Journey rail's selectors in this pass.
      eventName: "journey_stage_selected" as never,
    });
    expect(calls).toHaveLength(0);
  });
});

describe("a manager's own earlier answers", () => {
  it("reads only their own, in this scope, in this organization", async () => {
    await readFindingReviews("org", "m1", "scope-1");
    expect(calls[0]!.table).toBe("management_finding_reviews");
    expect(calls[0]!.filters).toEqual([
      ["organization_id", "org"],
      ["membership_id", "m1"],
      ["scope_fingerprint", "scope-1"],
    ]);
  });

  it("saves against the finding instance, so re-answering the same question updates it", async () => {
    await saveFindingReview({
      organizationId: "org",
      membershipId: "m1",
      findingKey: "overview_finding:no_demo",
      cohortKey: "no_demo",
      scopeFingerprint: "scope-1",
      findingFingerprint: "finding-1",
      reviewed: true,
      usefulness: "yes",
      actionType: "store_follow_up",
      wouldHaveKnownWithoutAnuma: "no",
      note: null,
    });
    expect(calls[0]!.options).toMatchObject({
      onConflict: "organization_id,membership_id,finding_fingerprint",
    });
    expect(calls[0]!.payload).toMatchObject({ finding_fingerprint: "finding-1" });
  });

  it("drops a value outside the vocabulary instead of storing it", async () => {
    await saveFindingReview({
      organizationId: "org",
      membershipId: "m1",
      findingKey: "overview_finding:no_demo",
      cohortKey: "no_demo",
      scopeFingerprint: "scope-1",
      findingFingerprint: "finding-1",
      reviewed: true,
      usefulness: "extremely" as never,
      actionType: null,
      wouldHaveKnownWithoutAnuma: null,
      note: null,
    });
    expect(calls[0]!.payload).toMatchObject({ usefulness: null });
  });
});
