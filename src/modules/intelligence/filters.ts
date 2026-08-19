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

/**
 * The secondary dimensions, which narrow rows rather than the query.
 *
 * Store, category and salesperson live on the conversation and are pushed into
 * the read. These four are read off the interaction itself, so they are applied
 * to the loaded population — which keeps one population per page and stops two
 * panels quietly measuring different sets.
 */
export const ARRIVAL_INTENTS = [
  "exploratory",
  "comparing",
  "specific_product",
  "ready_to_buy",
] as const;

export const BUSINESS_OUTCOMES = ["sale", "no_sale", "unknown"] as const;

export const DECISION_STATES = [
  "purchased",
  "follow_up_scheduled",
  "researching",
  "deferred",
  "rejected",
  "unknown",
] as const;

export type IntelligenceFilters = {
  days: WindowDays;
  /** Whether to measure the preceding equal-length window alongside. */
  compare: boolean;
  storeId: string | null;
  category: string | null;
  representativeMembershipId: string | null;
  /** arrival_intent_state. */
  intent: string | null;
  /** confirmed_business_outcome. */
  businessOutcome: string | null;
  /** final_decision_state. */
  decisionState: string | null;
  /** A value observed in language_mix. */
  language: string | null;
};

export type Period = { from: string; to: string };

export type ResolvedPeriods = {
  current: Period;
  /** The equal-length window immediately before, when comparison is on. */
  previous: Period | null;
};

/** What a page receives from Next, before anything has been validated. */
export type RawParams = Record<string, string | string[] | undefined>;

export function single(raw: RawParams, key: string): string | null {
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
  const oneOf = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    const value = single(raw, key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  };
  return {
    days: days ?? DEFAULT_WINDOW,
    compare: single(raw, "compare") !== "off",
    storeId: single(raw, "store"),
    category: single(raw, "category"),
    representativeMembershipId: single(raw, "rep"),
    intent: oneOf("intent", ARRIVAL_INTENTS),
    businessOutcome: oneOf("outcome", BUSINESS_OUTCOMES),
    decisionState: oneOf("decision", DECISION_STATES),
    language: single(raw, "language"),
  };
}

/**
 * The query keys that describe the population, and only those.
 *
 * Page-local state — the open tab, the selected stage, the drawer — is
 * deliberately not in this list. Carrying `stage=close` onto the Demand page
 * would be meaningless, and carrying `drawer=` onto another page would open a
 * panel nobody asked for.
 */
export const FILTER_PARAM_KEYS = [
  "days",
  "compare",
  "store",
  "category",
  "rep",
  "intent",
  "outcome",
  "decision",
  "language",
] as const;

/** Serialises filters back to a query string, omitting anything at its default. */
export function filtersToQuery(filters: IntelligenceFilters): string {
  const params = new URLSearchParams();
  if (filters.days !== DEFAULT_WINDOW) params.set("days", String(filters.days));
  if (!filters.compare) params.set("compare", "off");
  if (filters.storeId) params.set("store", filters.storeId);
  if (filters.category) params.set("category", filters.category);
  if (filters.representativeMembershipId) params.set("rep", filters.representativeMembershipId);
  if (filters.intent) params.set("intent", filters.intent);
  if (filters.businessOutcome) params.set("outcome", filters.businessOutcome);
  if (filters.decisionState) params.set("decision", filters.decisionState);
  if (filters.language) params.set("language", filters.language);
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

/**
 * A link that keeps the whole selection and adds page-local state.
 *
 * Tabs, the selected execution stage and the open drawer are all addresses
 * rather than component state, so a narrowed view with a stage open is
 * shareable and every one of them works before JavaScript arrives.
 */
export function intelligenceHref(
  basePath: string,
  filters: IntelligenceFilters,
  extra: Record<string, string | null> = {},
): string {
  const params = new URLSearchParams(filtersToQuery(filters).replace(/^\?/, ""));
  for (const [key, value] of Object.entries(extra)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Everything except one dimension, as hidden fields for a GET form. */
export function carryFields(
  filters: IntelligenceFilters,
  changing: string,
  extra: Record<string, string> = {},
): [string, string][] {
  const params = new URLSearchParams(filtersToQuery(filters).replace(/^\?/, ""));
  params.delete(changing);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return [...params.entries()];
}

/**
 * The parts of an interaction the secondary filters read.
 *
 * Structural rather than imported so this module stays free of the server-only
 * population loader and remains testable on fabricated rows.
 */
export type ScopedRow = {
  arrivalIntent: string | null;
  outcome: { business: string; decision: string };
  values: readonly { fieldKey: string; valueText: string | null; abstention: string | null }[];
};

/** Every language observed in the slice, for the filter's options. */
export function observedLanguages(rows: readonly ScopedRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const value of row.values) {
      if (value.fieldKey !== "language_mix" || value.abstention) continue;
      const text = (value.valueText ?? "").trim();
      if (text) seen.add(text);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Narrows a loaded population by the interaction-level filters.
 *
 * An authorized combination that matches nothing stays selected and returns
 * zero rows. Silently widening back to everything would answer a question the
 * reader did not ask, and they would have no way to tell.
 */
export function narrowByScope<T extends ScopedRow>(
  rows: readonly T[],
  filters: IntelligenceFilters,
): T[] {
  return rows.filter((row) => {
    if (filters.intent && row.arrivalIntent !== filters.intent) return false;
    if (filters.businessOutcome && row.outcome.business !== filters.businessOutcome) return false;
    if (filters.decisionState && row.outcome.decision !== filters.decisionState) return false;
    if (filters.language) {
      const spoken = row.values.some(
        (value) =>
          value.fieldKey === "language_mix" &&
          !value.abstention &&
          (value.valueText ?? "").trim() === filters.language,
      );
      if (!spoken) return false;
    }
    return true;
  });
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
  return days === 7 ? "Last 7 days" : days === 90 ? "Last 90 days" : "Last 30 days";
}

export function comparisonLabel(days: WindowDays): string {
  return `the ${days} days before that`;
}
