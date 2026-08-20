import { describe, expect, it } from "vitest";

import { computePilotMetrics, scopeHash, USAGE_EVENTS } from "@/modules/intelligence/pilot";

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
  it("is stable however the filters were ordered", () => {
    expect(scopeHash({ days: 7, store: "s1", category: null })).toBe(
      scopeHash({ category: null, store: "s1", days: 7 }),
    );
  });

  it("distinguishes two different selections", () => {
    expect(scopeHash({ days: 7 })).not.toBe(scopeHash({ days: 30 }));
  });

  it("says so when nothing is narrowed", () => {
    expect(scopeHash({ store: null, category: "" })).toBe("all");
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
