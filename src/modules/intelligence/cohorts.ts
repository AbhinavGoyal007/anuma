import { frontlineActionCohorts, type ActionCohort } from "@/modules/intelligence/frontline";
import { journeyLeakageCohorts, selectCohort } from "@/modules/intelligence/journey";
import type { JourneyCohortKey } from "@/modules/intelligence/journey";
import { NUMERATOR_COHORTS } from "@/modules/intelligence/measures";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * Every named group of interactions a page can point at, in one place.
 *
 * The drill-down recomputes the group from the population rather than being
 * handed a list of ids, which is what makes the list provably the set the number
 * came from. Resolving every page's groups through one function is the same
 * argument one level up: two routes each rebuilding "the interactions where a
 * commitment went unanswered" will agree until one of them is edited.
 *
 * Three kinds of group, distinguished by prefix:
 *   numerator:  the interactions a headline metric counted
 *   value:      the interactions carrying one observed value of one field
 *   (none)      a named failure or leakage cohort
 */

export const NUMERATOR_COHORT_PREFIX = "numerator:";
export const VALUE_COHORT_PREFIX = "value:";

export function numeratorCohortKey(measureKey: string): string {
  return `${NUMERATOR_COHORT_PREFIX}${measureKey}`;
}

export function valueCohortKey(fieldKey: string, value: string): string {
  return `${VALUE_COHORT_PREFIX}${fieldKey}:${value}`;
}

/** Marks a path segment as a transported key rather than a plain one. */
const TRANSPORT_PREFIX = "b~";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const padded = token.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

/**
 * The one place a cohort key becomes a URL.
 *
 * Percent-encoding is not enough for a dynamic route segment. A colon survives
 * `encodeURIComponent` as `%3A` and arrives back still escaped, so every
 * prefixed key — `value:…`, `numerator:…` — failed its own prefix check and
 * the drill-down answered 404. A slash is worse: `%2F` is normalised by enough
 * intermediaries that a product called "iPhone 15/Pro" cannot be trusted to a
 * path at all.
 *
 * So the key travels the path as one base64url token: a single segment, no
 * reserved characters, and every product name, price claim and emoji arrives
 * exactly as it left. Query parameters keep the readable form, because
 * `URLSearchParams` handles them correctly and a drawer link stays legible.
 */
export function cohortPath(key: string): string {
  return `/intelligence/cohort/${TRANSPORT_PREFIX}${toBase64Url(key)}`;
}

/**
 * A cohort key as it arrives from a route segment.
 *
 * Transported keys are decoded; anything else is returned untouched, so a
 * hand-typed or older link to a simple key still resolves.
 */
export function decodeCohortKey(segment: string): string {
  if (!segment.startsWith(TRANSPORT_PREFIX)) return segment;
  try {
    return fromBase64Url(segment.slice(TRANSPORT_PREFIX.length));
  } catch {
    return segment;
  }
}

/**
 * The interactions a headline metric counted.
 *
 * This is what makes a metric tile honest: the tile displays `measure.affected`
 * and the click opens exactly `rows`, from the same function. A tile that
 * displayed a rate and opened the *failure* cohort beside it — the finance
 * demand tile opening the interactions with no finance response — was showing
 * one number and offering a different set of conversations.
 */
export function numeratorCohort(
  rows: readonly PopulationRow[],
  measureKey: string,
): ActionCohort | null {
  const definition = NUMERATOR_COHORTS[measureKey];
  if (!definition) return null;
  const matched = definition.rows(rows);
  return {
    key: numeratorCohortKey(measureKey),
    headline: definition.label,
    reason: definition.reason,
    evidenceFieldKeys: definition.fieldKeys,
    measurable: definition.measure(rows).observed,
    conversationIds: matched.map((row) => row.conversationId),
  };
}

/**
 * The interactions carrying one observed value of one field.
 *
 * Not a failure cohort — it is the set behind a bar. Its evidence is the field
 * itself, so a reader clicking "Samsung" sees the sentence where Samsung was
 * actually said rather than a summary of why we counted it.
 */
export function valueCohort(
  rows: readonly PopulationRow[],
  fieldKey: string,
  value: string,
): ActionCohort {
  const matched = rows.filter((row) =>
    row.values.some(
      (item) =>
        item.fieldKey === fieldKey && !item.abstention && (item.valueText ?? "").trim() === value,
    ),
  );
  const measurable = rows.filter((row) =>
    row.values.some((item) => item.fieldKey === fieldKey),
  ).length;
  return {
    key: valueCohortKey(fieldKey, value),
    headline: `recorded “${value}”`,
    reason: `The field ${fieldKey} carried this exact value`,
    evidenceFieldKeys: [fieldKey],
    measurable,
    conversationIds: matched.map((row) => row.conversationId),
  };
}

export function resolveCohort(
  rows: readonly PopulationRow[],
  key: string,
  journeyCohort: JourneyCohortKey = "all",
): ActionCohort | null {
  if (key.startsWith(NUMERATOR_COHORT_PREFIX)) {
    return numeratorCohort(rows, key.slice(NUMERATOR_COHORT_PREFIX.length));
  }

  if (key.startsWith(VALUE_COHORT_PREFIX)) {
    const rest = key.slice(VALUE_COHORT_PREFIX.length);
    // First colon only: a field key never contains one, and a value may.
    const separator = rest.indexOf(":");
    if (separator <= 0) return null;
    return valueCohort(rows, rest.slice(0, separator), rest.slice(separator + 1));
  }

  const frontline = frontlineActionCohorts(rows).find((cohort) => cohort.key === key);
  if (frontline) return frontline;

  // Journey groups are defined within a selected cohort, so the same key means
  // a different set depending on which one is chosen. The caller passes it
  // through from the URL so a shared link opens the group that was clicked.
  const journey = journeyLeakageCohorts(selectCohort(rows, journeyCohort)).find(
    (cohort) => cohort.key === key,
  );
  return journey ?? null;
}
