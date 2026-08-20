import { describe, expect, it } from "vitest";

import {
  canonicalize,
  findingFingerprint,
  scopeFingerprint,
} from "@/modules/intelligence/canonical";
import { computePilotMetrics, USAGE_EVENTS } from "@/modules/intelligence/pilot";

/**
 * Whether the pilot is working, measured the same way every time.
 *
 * Adoption metrics are the easiest kind to flatter, so each of these is pinned
 * to a fixture: a manager who opened an action but never reached the evidence
 * has to count against the rate, and a review with no action recorded has to
 * count as no action taken.
 */

const NOW = new Date("2026-08-20T12:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const event = (
  overrides: Partial<Parameters<typeof computePilotMetrics>[0][number]> = {},
): Parameters<typeof computePilotMetrics>[0][number] => ({
  membership_id: "m1",
  session_id: "s1",
  occurred_at: ago(1),
  event_name: "intelligence_page_viewed",
  cohort_key: null,
  ...overrides,
});

describe("pilot adoption", () => {
  it("counts a manager once a week however often they looked", () => {
    const metrics = computePilotMetrics(
      [event(), event({ occurred_at: ago(2) }), event({ membership_id: "m2" })],
      [],
      NOW,
    );
    expect(metrics.weeklyActiveManagers).toBe(2);
  });

  it("counts a returning manager only when they were here last week too", () => {
    const metrics = computePilotMetrics(
      [
        event({ membership_id: "m1", occurred_at: ago(1) }),
        event({ membership_id: "m1", occurred_at: ago(24 * 8) }),
        event({ membership_id: "m2", occurred_at: ago(1) }),
      ],
      [],
      NOW,
    );
    expect(metrics.weeklyActiveManagers).toBe(2);
    expect(metrics.managersReturningWeekOverWeek).toBe(1);
  });

  it("counts an action that never reached the evidence against the rate", () => {
    const metrics = computePilotMetrics(
      [
        event({ event_name: "priority_action_opened", cohort_key: "a", occurred_at: ago(2) }),
        event({ event_name: "evidence_drawer_opened", cohort_key: "a", occurred_at: ago(1.9) }),
        event({ event_name: "priority_action_opened", cohort_key: "b", occurred_at: ago(1) }),
      ],
      [],
      NOW,
    );
    expect(metrics.priorityActionsOpened).toBe(2);
    expect(metrics.evidenceDrawerRateFromPriorityActions).toBe(0.5);
    expect(metrics.medianSecondsPriorityActionToEvidence).toBeCloseTo(360, 0);
  });

  it("does not pair an action with a drawer opened in another session", () => {
    const metrics = computePilotMetrics(
      [
        event({ event_name: "priority_action_opened", cohort_key: "a", session_id: "s1" }),
        event({ event_name: "evidence_drawer_opened", cohort_key: "a", session_id: "s2" }),
      ],
      [],
      NOW,
    );
    expect(metrics.evidenceDrawerRateFromPriorityActions).toBe(0);
  });

  it("treats a review with no action recorded as no action taken", () => {
    const metrics = computePilotMetrics(
      [],
      [
        {
          membership_id: "m1",
          usefulness: "yes",
          action_type: "store_follow_up",
          reviewed_at: ago(1),
        },
        {
          membership_id: "m1",
          usefulness: "no",
          action_type: "no_action_yet",
          reviewed_at: ago(1),
        },
      ],
      NOW,
    );
    expect(metrics.findingsReviewed).toBe(2);
    expect(metrics.usefulFindingRate).toBe(0.5);
    expect(metrics.managementActionRate).toBe(0.5);
  });

  it("reports nothing rather than zero when nothing has been reviewed", () => {
    const metrics = computePilotMetrics([], [], NOW);
    expect(metrics.usefulFindingRate).toBeNull();
    expect(metrics.managementActionRate).toBeNull();
    expect(metrics.medianSecondsPriorityActionToEvidence).toBeNull();
  });
});

describe("the scope a finding was judged under", () => {
  const scope = { from: "2026-07-21", to: "2026-08-20" };

  it("is stable however the filters were ordered", () => {
    expect(
      scopeFingerprint({ ...scope, filters: { store: "s1", category: "sofas", stage: null } }),
    ).toBe(scopeFingerprint({ ...scope, filters: { stage: null, category: "sofas", store: "s1" } }));
  });

  it("distinguishes two different selections", () => {
    expect(scopeFingerprint({ ...scope, filters: { store: "s1" } })).not.toBe(
      scopeFingerprint({ ...scope, filters: { store: "s2" } }),
    );
  });

  it("changes when the absolute period moves under the same relative window", () => {
    // "Last 30 days" is a different population every morning. A review saved
    // yesterday must not silently attach itself to today's numbers.
    expect(scopeFingerprint({ from: "2026-07-21", to: "2026-08-20", filters: {} })).not.toBe(
      scopeFingerprint({ from: "2026-07-22", to: "2026-08-21", filters: {} }),
    );
  });

  it("treats an unset filter and an empty one as the same absence", () => {
    expect(scopeFingerprint({ ...scope, filters: { store: null, category: "" } })).toBe(
      scopeFingerprint({ ...scope, filters: {} }),
    );
  });

  it("is a sha-256 digest, not a joined string", () => {
    const fingerprint = scopeFingerprint({ ...scope, filters: { store: "s1" } });
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain("s1");
  });
});

describe("a finding as it stood when it was answered", () => {
  const base = {
    scopeFingerprint: "scope",
    page: "overview",
    findingKey: "overview_finding:action:no_demo",
    cohortKey: "action:no_demo",
    recordIds: ["c1", "c2", "c3"],
  };

  it("does not depend on the order the cohort came back in", () => {
    expect(findingFingerprint(base)).toBe(
      findingFingerprint({ ...base, recordIds: ["c3", "c1", "c2"] }),
    );
  });

  it("changes when the cohort's membership changes", () => {
    // Same finding, same filters, different eighteen interactions. Answering
    // "yes, useful" about one set must not silently become an answer about the
    // other.
    expect(findingFingerprint(base)).not.toBe(
      findingFingerprint({ ...base, recordIds: ["c1", "c2", "c4"] }),
    );
  });

  it("changes when the scope changes", () => {
    expect(findingFingerprint(base)).not.toBe(
      findingFingerprint({ ...base, scopeFingerprint: "other" }),
    );
  });

  it("keeps two cohorts on the same page distinct", () => {
    expect(findingFingerprint(base)).not.toBe(
      findingFingerprint({ ...base, cohortKey: "action:no_alternative" }),
    );
  });
});

describe("canonical serialisation", () => {
  it("sorts keys and keeps nulls", () => {
    expect(canonicalize({ b: 1, a: null })).toBe('{"a":null,"b":1}');
  });

  it("cannot be forged by moving a delimiter between fields", () => {
    // The failure mode of `key=value&key=value`: two different selections
    // producing one string, and one manager's answer landing on another's
    // finding.
    expect(canonicalize({ a: "x&b=y" })).not.toBe(canonicalize({ a: "x", b: "y" }));
  });
});

describe("the event vocabulary is closed", () => {
  it("is exactly the fifteen names the contract allows", () => {
    // Adding a name here without adding it to the database check constraint
    // would write rows the table refuses, silently losing the event.
    // `journey_stage_selected` was removed when the rail nodes became static:
    // an event for a control that no longer exists is a metric nobody can
    // interpret.
    expect(USAGE_EVENTS).toHaveLength(15);
    expect(USAGE_EVENTS).not.toContain("journey_stage_selected");
    expect(USAGE_EVENTS).toContain("priority_action_opened");
    expect(USAGE_EVENTS).toContain("management_action_saved");
  });
});
