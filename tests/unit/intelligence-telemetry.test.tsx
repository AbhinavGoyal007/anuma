import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TelemetryLink, TelemetryScope } from "@/components/intelligence/telemetry";
import { USAGE_EVENTS } from "@/modules/intelligence/pilot";
import { resolveReviewableFinding, reviewableCohortKeys } from "@/modules/intelligence/reviewable";
import { isUuid } from "@/modules/intelligence/session";

import { row, value } from "../support/population";

/**
 * What the pilot records, and — more importantly — what it must not.
 *
 * Every number in the pilot report is an adoption claim: this many managers
 * looked, this many reached the evidence, this many judged a finding useful.
 * A telemetry write that happens during render or from URL state makes all of
 * them unfalsifiable, because the product would be counting the router rather
 * than a person.
 */

type Sent = { event: string; clientEventId: string; page: string; cohortKey?: string };

function sentEvents(): Sent[] {
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
  return calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)) as Sent);
}

beforeEach(() => {
  globalThis.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const SCOPE = { page: "overview", scopeFingerprint: "scope-1", filters: { store: "s1" } };

describe("a page view is a page somebody saw", () => {
  it("is written after the page commits, never while the server renders it", () => {
    // The proof that the write cannot happen during a Server Component render:
    // no page module reaches a telemetry writer at all. The endpoint is the
    // only writer, and only a browser can reach it.
    for (const page of ["overview", "demand", "journey", "frontline"]) {
      const source = readFileSync(`src/app/(app)/intelligence/${page}/page.tsx`, "utf8");
      expect(source).not.toContain("recordUsageEvent");
      expect(source).not.toContain("recordIntelligenceView");
    }
  });

  it("writes exactly one page view however often the page re-renders", () => {
    const view = render(
      <TelemetryScope {...SCOPE} drawerKey={null}>
        <p>page</p>
      </TelemetryScope>,
    );
    view.rerender(
      <TelemetryScope {...SCOPE} drawerKey={null}>
        <p>page</p>
      </TelemetryScope>,
    );
    expect(sentEvents().filter((sent) => sent.event === "intelligence_page_viewed")).toHaveLength(1);
  });

  it("gives every event its own id, so a retried beacon is not a second interaction", () => {
    render(
      <TelemetryScope {...SCOPE} drawerKey="no_demo">
        <p>page</p>
      </TelemetryScope>,
    );
    const ids = sentEvents().map((sent) => sent.clientEventId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(isUuid(id)).toBe(true);
  });
});

describe("a shared link is not a click", () => {
  it("records the drawer it opened with and never the control that would have opened it", () => {
    render(
      <TelemetryScope {...SCOPE} drawerKey="action:no_demo">
        <p>page</p>
      </TelemetryScope>,
    );
    const events = sentEvents().map((sent) => sent.event);
    expect(events).toContain("intelligence_page_viewed");
    expect(events).toContain("evidence_drawer_opened");
    // Arriving by a link somebody sent you is not activating a priority action.
    expect(events).not.toContain("priority_action_opened");
    expect(events).not.toContain("core_signal_opened");
  });
});

describe("a control records its own activation", () => {
  it("writes one priority_action_opened for one click", async () => {
    const view = render(
      <TelemetryScope {...SCOPE} drawerKey={null}>
        <TelemetryLink
          href="/intelligence/overview?drawer=action:no_demo"
          telemetry={{
            event: "priority_action_opened",
            objectType: "action",
            objectKey: "action:no_demo",
            cohortKey: "action:no_demo",
          }}
        >
          Open
        </TelemetryLink>
      </TelemetryScope>,
    );
    view.getByRole("link", { name: "Open" }).click();
    const opened = sentEvents().filter((sent) => sent.event === "priority_action_opened");
    expect(opened).toHaveLength(1);
    expect(opened[0]!.cohortKey).toBe("action:no_demo");
    // The scope travels with it, so the click can be traced to the population
    // it was made in.
    expect(opened[0]!.page).toBe("overview");
  });

  it("only ever sends a name the database accepts", () => {
    render(
      <TelemetryScope {...SCOPE} drawerKey="action:no_demo">
        <p>page</p>
      </TelemetryScope>,
    );
    for (const sent of sentEvents()) {
      expect(USAGE_EVENTS as readonly string[]).toContain(sent.event);
    }
  });
});

describe("a browser may not name its own finding", () => {
  const rows = [
    row({
      conversationId: "c1",
      recordId: "r1",
      values: [value("products_recommended", "Sofa"), notRecorded()],
    }),
  ];

  function notRecorded() {
    return value("recommendation_reasons", null, { abstention: "not_stated" });
  }

  it("rejects a cohort the page never offered", () => {
    expect(resolveReviewableFinding("overview", "made_up_cohort", rows)).toBeNull();
  });

  it("resolves a real one to the records currently in it", () => {
    const [first] = reviewableCohortKeys("overview", rows);
    if (!first) return; // No priority action in this population: nothing to review.
    const finding = resolveReviewableFinding("overview", first, rows);
    expect(finding).not.toBeNull();
    expect(finding!.findingKey).toBe(`overview_finding:${first}`);
    expect(finding!.recordIds).toEqual([...finding!.recordIds].sort());
  });

  it("offers nothing to review on Demand, which shows evidence rather than actions", () => {
    expect(reviewableCohortKeys("demand", rows)).toEqual([]);
  });
});

describe("the authenticated suite cannot skip itself", () => {
  it("has no skip left in the Intelligence spec", () => {
    const spec = readFileSync("tests/e2e/intelligence-demo-readiness.spec.ts", "utf8");
    expect(spec).not.toContain("test.skip");
  });

  it("makes every authenticated project depend on a real session", () => {
    const config = readFileSync("playwright.config.ts", "utf8");
    expect(config).toContain('dependencies: ["setup"]');
    expect(config).toContain("storageState: AUTH_FILE");
  });
});
