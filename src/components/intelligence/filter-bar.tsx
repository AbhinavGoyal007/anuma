import Link from "next/link";

import {
  ARRIVAL_INTENTS,
  BUSINESS_OUTCOMES,
  carryFields,
  DECISION_STATES,
  intelligenceHref,
  windowLabel,
  WINDOW_DAYS,
  withFilter,
  type IntelligenceFilters,
} from "@/modules/intelligence/filters";
import { BUSINESS_LABELS, DECISION_LABELS } from "@/modules/intelligence/outcome";

/**
 * The selection every Intelligence page shares.
 *
 * One control per dimension, not one chip per value. Four dimensions with eight
 * values each is fifty buttons across the top of the page, and a filter row that
 * reads as the page's main content pushes the actual findings below the fold.
 * Each control opens to reveal its values — as chips while they fit on a line,
 * as a select past that.
 *
 * Links and a plain GET form rather than JavaScript state, so the whole thing
 * works before any script arrives and each state is a real address someone can
 * send to a colleague.
 *
 * Options are passed in already narrowed to what the viewer may see. A store
 * they have no assignment to is not rendered as a disabled choice — it is not
 * rendered, because a filter listing places someone cannot open is a slow
 * disclosure of the organization's shape.
 */

export type FilterOption = { id: string; name: string };

/**
 * Above this many options a dimension stops being chips.
 *
 * Chips are the better control while every choice fits inside the popover — the
 * whole selection is readable at a glance and each state is a real address.
 * Fifty salespeople as fifty chips is a wall, so past this the dimension becomes
 * a select. Both keep URL-addressable state; only the affordance changes.
 */
const CHIP_LIMIT = 8;

function readable(token: string): string {
  const spaced = token.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      className={`ip-option${active ? " ip-option--active" : ""}`}
      href={href}
      aria-current={active ? "true" : undefined}
    >
      {children}
    </Link>
  );
}

/**
 * One dimension: a control showing the current value, opening to its choices.
 *
 * Past the chip limit the choices become a select inside a GET form. The other
 * filters ride along as hidden fields, which is what keeps a narrowed view from
 * silently resetting when one dimension changes.
 */
function Dimension({
  basePath,
  filters,
  carry,
  label,
  name,
  field,
  allLabel,
  options,
  selected,
  hrefFor,
  active,
}: {
  basePath: string;
  filters: IntelligenceFilters;
  carry: Record<string, string>;
  label: string;
  name: string;
  field: keyof IntelligenceFilters;
  allLabel: string;
  options: FilterOption[];
  selected: string | null;
  /** Overrides how a choice becomes a link, for dimensions that are not strings. */
  hrefFor?: (id: string | null) => string;
  /** Overrides when the control reads as narrowed. */
  active?: boolean;
}) {
  if (options.length === 0) return null;
  const current = options.find((option) => option.id === selected);
  const scalable = options.length > CHIP_LIMIT;
  const link = (id: string | null) =>
    hrefFor
      ? hrefFor(id)
      : intelligenceHref(basePath, withFilter(filters, field, id as never), carry);
  const narrowed = active ?? current !== undefined;

  return (
    <details className="ip-dim">
      <summary
        className={`ip-filter${narrowed ? " ip-filter--active" : ""}`}
        aria-label={`${label}: ${current?.name ?? allLabel}`}
      >
        {current?.name ?? allLabel}
      </summary>
      <div className="ip-dim-panel">
        <p className="ip-filter-label">{label}</p>
        {scalable ? (
          <form className="ip-filter-form" method="get" action={basePath}>
            {carryFields(filters, name, carry).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <label className="ip-visually-hidden" htmlFor={`filter-${name}`}>
              {label}
            </label>
            <select
              className="ip-select"
              id={`filter-${name}`}
              name={name}
              defaultValue={selected ?? ""}
            >
              <option value="">{allLabel}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <button className="ip-apply" type="submit">
              Apply
            </button>
          </form>
        ) : (
          <div className="ip-options">
            {hrefFor ? null : (
              <Chip href={link(null)} active={selected === null}>
                {allLabel}
              </Chip>
            )}
            {options.map((option) => (
              <Chip key={option.id} href={link(option.id)} active={selected === option.id}>
                {option.name}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function IntelligenceFilterBar({
  basePath,
  filters,
  stores,
  categories,
  representatives = [],
  intents = [],
  languages = [],
  interactions,
  storeCount,
  carry = {},
}: {
  basePath: string;
  filters: IntelligenceFilters;
  stores: FilterOption[];
  categories: string[];
  representatives?: FilterOption[];
  intents?: string[];
  languages?: string[];
  /** Interactions in the fully narrowed population, for the scope line. */
  interactions: number;
  storeCount: number;
  /** Page-local state (open tab, selected stage) preserved by every filter link. */
  carry?: Record<string, string>;
}) {
  const narrowed =
    filters.storeId !== null ||
    filters.category !== null ||
    filters.representativeMembershipId !== null ||
    filters.intent !== null ||
    filters.businessOutcome !== null ||
    filters.decisionState !== null ||
    filters.language !== null;
  const secondaryCount = [
    filters.intent,
    filters.businessOutcome,
    filters.decisionState,
    filters.language,
  ].filter((value) => value !== null).length;
  // A language chosen under a wider period stays selected rather than being
  // dropped back to "all" without the reader asking. It is a preference, not an
  // authorization boundary, so an empty result is the honest answer.
  const languageOptions = [
    ...new Set([...languages, ...(filters.language ? [filters.language] : [])]),
  ];
  const shared = { basePath, filters, carry };

  return (
    <div className="ip-filters">
      <div className="ip-filter-row" role="group" aria-label="Filters">
        <Dimension
          {...shared}
          label="Period"
          name="days"
          field="days"
          allLabel={windowLabel(filters.days)}
          selected={String(filters.days)}
          options={WINDOW_DAYS.map((days) => ({ id: String(days), name: windowLabel(days) }))}
          hrefFor={(id) =>
            intelligenceHref(
              basePath,
              withFilter(filters, "days", Number(id) as (typeof WINDOW_DAYS)[number]),
              carry,
            )
          }
          active={false}
        />
        <Dimension
          {...shared}
          label="Store"
          name="store"
          field="storeId"
          allLabel="All stores"
          options={stores.length > 1 ? stores : []}
          selected={filters.storeId}
        />
        <Dimension
          {...shared}
          label="Category"
          name="category"
          field="category"
          allLabel="All categories"
          options={
            categories.length > 1 ? categories.map((value) => ({ id: value, name: value })) : []
          }
          selected={filters.category}
        />
        <Dimension
          {...shared}
          label="Salesperson"
          name="rep"
          field="representativeMembershipId"
          allLabel="All salespeople"
          options={representatives.length > 1 ? representatives : []}
          selected={filters.representativeMembershipId}
        />

        <Link
          className={`ip-filter${filters.compare ? " ip-filter--active" : ""}`}
          href={intelligenceHref(basePath, withFilter(filters, "compare", !filters.compare), carry)}
          aria-pressed={filters.compare}
        >
          Compare previous
        </Link>

        <details className="ip-dim ip-more">
          <summary className={`ip-filter${secondaryCount > 0 ? " ip-filter--active" : ""}`}>
            More filters{secondaryCount > 0 ? ` · ${secondaryCount}` : ""}
          </summary>
          <div className="ip-dim-panel ip-more-panel">
            <Dimension
              {...shared}
              label="Arrival intent"
              name="intent"
              field="intent"
              allLabel="Any arrival intent"
              options={(intents.length > 0 ? intents : [...ARRIVAL_INTENTS]).map((value) => ({
                id: value,
                name: readable(value),
              }))}
              selected={filters.intent}
            />
            <Dimension
              {...shared}
              label="Business outcome"
              name="outcome"
              field="businessOutcome"
              allLabel="Any business outcome"
              options={BUSINESS_OUTCOMES.map((value) => ({
                id: value,
                name: BUSINESS_LABELS[value],
              }))}
              selected={filters.businessOutcome}
            />
            <Dimension
              {...shared}
              label="Customer closing state"
              name="decision"
              field="decisionState"
              allLabel="Any closing state"
              options={DECISION_STATES.map((value) => ({
                id: value,
                name: DECISION_LABELS[value],
              }))}
              selected={filters.decisionState}
            />
            <Dimension
              {...shared}
              label="Language"
              name="language"
              field="language"
              allLabel="Any language"
              options={languageOptions.map((value) => ({ id: value, name: value }))}
              selected={filters.language}
            />
            {/* Quadrant and Team are absent rather than disabled: no canonical
                quadrant source is connected, and no trusted team assignment is
                available to filter by. A control that cannot narrow anything is
                a promise the page does not keep. */}
          </div>
        </details>

        {narrowed ? (
          <Link
            className="ip-reset"
            href={intelligenceHref(
              basePath,
              {
                ...filters,
                storeId: null,
                category: null,
                representativeMembershipId: null,
                intent: null,
                businessOutcome: null,
                decisionState: null,
                language: null,
              },
              carry,
            )}
          >
            Reset
          </Link>
        ) : null}
      </div>
      <p className="ip-scope">
        Scope: {interactions} interaction{interactions === 1 ? "" : "s"} · {storeCount} store
        {storeCount === 1 ? "" : "s"} · {windowLabel(filters.days)}
      </p>
    </div>
  );
}

/** The compact page head the contract fixes: eyebrow, one-word title. */
export function IntelligenceHead({ title }: { title: string }) {
  return (
    <div className="ip-pagehead">
      <p className="ip-eyebrow">Intelligence</p>
      <h1>{title}</h1>
    </div>
  );
}
