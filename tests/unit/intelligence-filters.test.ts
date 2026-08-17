import { describe, expect, it } from "vitest";

import {
  DEFAULT_WINDOW,
  filtersToQuery,
  parseFilters,
  resolvePeriods,
  withFilter,
} from "@/modules/intelligence/filters";

describe("reading the selection out of a URL", () => {
  it("falls back rather than failing on a nonsense window", () => {
    // A stale or hand-edited link should land somewhere sensible, not error.
    expect(parseFilters({ days: "999" }).days).toBe(DEFAULT_WINDOW);
    expect(parseFilters({ days: "abc" }).days).toBe(DEFAULT_WINDOW);
    expect(parseFilters({}).days).toBe(DEFAULT_WINDOW);
  });

  it("accepts the offered windows", () => {
    expect(parseFilters({ days: "7" }).days).toBe(7);
    expect(parseFilters({ days: "90" }).days).toBe(90);
  });

  it("compares by default and only stops when told to", () => {
    expect(parseFilters({}).compare).toBe(true);
    expect(parseFilters({ compare: "off" }).compare).toBe(false);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseFilters({ store: ["a", "b"] }).storeId).toBe("a");
  });

  it("treats a blank parameter as absent", () => {
    expect(parseFilters({ store: "   " }).storeId).toBeNull();
  });
});

describe("putting the selection back into a URL", () => {
  it("omits everything sitting at its default", () => {
    expect(filtersToQuery(parseFilters({}))).toBe("");
  });

  it("round-trips a narrowed view", () => {
    const filters = parseFilters({ days: "7", store: "s1", category: "laptop", compare: "off" });
    expect(parseFilters(Object.fromEntries(new URLSearchParams(filtersToQuery(filters))))).toEqual(
      filters,
    );
  });

  it("changes one field without disturbing the rest", () => {
    const filters = parseFilters({ days: "7", store: "s1" });
    const next = withFilter(filters, "days", 90);
    expect(next.days).toBe(90);
    expect(next.storeId).toBe("s1");
  });
});

describe("turning a window into instants", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");

  it("makes the comparison window end exactly where the current one starts", () => {
    // Overlapping periods count some conversations twice and make every delta
    // smaller than it really is.
    const periods = resolvePeriods(parseFilters({ days: "30" }), now);
    expect(periods.previous!.to).toBe(periods.current.from);
  });

  it("gives both periods the same length", () => {
    const periods = resolvePeriods(parseFilters({ days: "7" }), now);
    const span = (p: { from: string; to: string }) =>
      new Date(p.to).getTime() - new Date(p.from).getTime();
    expect(span(periods.previous!)).toBe(span(periods.current));
    expect(span(periods.current)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("returns no comparison window when comparison is off", () => {
    expect(resolvePeriods(parseFilters({ compare: "off" }), now).previous).toBeNull();
  });
});
