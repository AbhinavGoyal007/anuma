/**
 * The population every Intelligence page is looking at, held in the URL.
 *
 * In the URL rather than in component state for two reasons. A manager who has
 * narrowed to one store and a fortnight can send that view to someone else, and
 * a drill-down can inherit the selection exactly — which is what makes the list
 * behind a number provably the same set the number was computed from, rather
 * than a second query that resembles it.
 *
 * Pure. Parsing and period arithmetic are separated from any fetching so the
 * awkward parts — a comparison window that must not overlap the current one,
 * an unparseable value falling back rather than throwing — are testable without
 * a database or a browser.
 */

export const WINDOW_DAYS = [7, 30, 90] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];

export const DEFAULT_WINDOW: WindowDays = 30;

export type IntelligenceFilters = {
  days: WindowDays;
  /** Whether to measure the preceding equal-length window alongside. */
  compare: boolean;
  storeId: string | null;
  category: string | null;
  representativeMembershipId: string | null;
};

export type Period = { from: string; to: string };

export type ResolvedPeriods = {
  current: Period;
  /** The equal-length window immediately before, when comparison is on. */
  previous: Period | null;
};

/** What a page receives from Next, before anything has been validated. */
export type RawParams = Record<string, string | string[] | undefined>;

function single(raw: RawParams, key: string): string | null {
  const value = raw[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first && first.trim() ? first.trim() : null;
}

/**
 * Reads filters from the URL, falling back rather than failing.
 *
 * A hand-edited or stale link should land the reader on a sensible page, not an
 * error — but a store or representative id is deliberately not validated here.
 * Whether the viewer may see that store is an authorization question, and
 * answering it in a parsing function is how a filter quietly becomes a way to
 * read someone else's data.
 */
export function parseFilters(raw: RawParams): IntelligenceFilters {
  const days = WINDOW_DAYS.find((option) => option === Number(single(raw, "days")));
  return {
    days: days ?? DEFAULT_WINDOW,
    compare: single(raw, "compare") !== "off",
    storeId: single(raw, "store"),
    category: single(raw, "category"),
    representativeMembershipId: single(raw, "rep"),
  };
}

/** Serialises filters back to a query string, omitting anything at its default. */
export function filtersToQuery(filters: IntelligenceFilters): string {
  const params = new URLSearchParams();
  if (filters.days !== DEFAULT_WINDOW) params.set("days", String(filters.days));
  if (!filters.compare) params.set("compare", "off");
  if (filters.storeId) params.set("store", filters.storeId);
  if (filters.category) params.set("category", filters.category);
  if (filters.representativeMembershipId) params.set("rep", filters.representativeMembershipId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The same filters with one field changed, for building a link. */
export function withFilter<K extends keyof IntelligenceFilters>(
  filters: IntelligenceFilters,
  key: K,
  value: IntelligenceFilters[K],
): IntelligenceFilters {
  return { ...filters, [key]: value };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns a window into concrete instants.
 *
 * Half-open: `from` is included and `to` is not, so an interaction on the
 * boundary belongs to exactly one period. The previous window ends where the
 * current one begins for the same reason — an overlapping comparison counts some
 * conversations twice and makes every delta smaller than it is.
 */
export function resolvePeriods(
  filters: IntelligenceFilters,
  now: Date = new Date(),
): ResolvedPeriods {
  const to = now;
  const from = new Date(to.getTime() - filters.days * DAY_MS);
  return {
    current: { from: from.toISOString(), to: to.toISOString() },
    previous: filters.compare
      ? {
          from: new Date(from.getTime() - filters.days * DAY_MS).toISOString(),
          to: from.toISOString(),
        }
      : null,
  };
}

export function windowLabel(days: WindowDays): string {
  return days === 7 ? "the last 7 days" : days === 90 ? "the last 90 days" : "the last 30 days";
}

export function comparisonLabel(days: WindowDays): string {
  return `the ${days} days before that`;
}
