import Link from "next/link";

import {
  filtersToQuery,
  WINDOW_DAYS,
  withFilter,
  type IntelligenceFilters,
} from "@/modules/intelligence/filters";

/**
 * The selection every Intelligence page shares.
 *
 * Links rather than form controls, so the whole thing works before any
 * JavaScript arrives and each state is a real address someone can send to a
 * colleague. Compact by design: a row of chips reads as a setting, whereas a
 * bank of large dropdowns across the top reads as the page's main content and
 * pushes the actual findings below the fold.
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
 * Chips are the better control while every choice fits on one line — the whole
 * selection is readable at a glance and each state is a real address. Fifty
 * salespeople as fifty chips is a wall, so past this the dimension becomes a
 * select. Both keep URL-addressable state; only the affordance changes.
 */
const CHIP_LIMIT = 8;

/**
 * A dimension with too many options to show as chips.
 *
 * A plain form submitting by GET, so it works with keyboard, without
 * JavaScript, and lands on a real URL exactly like the chips do. The other
 * filters ride along as hidden fields, which is what keeps a narrowed view from
 * silently resetting when one dimension changes.
 */
function SelectFilter({
  basePath,
  label,
  name,
  options,
  selected,
  carry,
}: {
  basePath: string;
  label: string;
  name: string;
  options: FilterOption[];
  selected: string | null;
  carry: [string, string][];
}) {
  return (
    <form className="ifb-group ifb-form" method="get" action={basePath}>
      {carry.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="ifb-label" htmlFor={`filter-${name}`}>
        {label}
      </label>
      <select
        className="ifb-select"
        id={`filter-${name}`}
        name={name}
        defaultValue={selected ?? ""}
      >
        <option value="">All {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button className="ifb-apply" type="submit">
        Apply
      </button>
    </form>
  );
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
      className={`ifb-chip${active ? " ifb-chip--active" : ""}`}
      href={href}
      aria-current={active ? "true" : undefined}
    >
      {children}
    </Link>
  );
}

export function IntelligenceFilterBar({
  basePath,
  filters,
  stores,
  categories,
  representatives = [],
}: {
  basePath: string;
  filters: IntelligenceFilters;
  stores: FilterOption[];
  categories: string[];
  representatives?: FilterOption[];
}) {
  const narrowed =
    filters.storeId !== null ||
    filters.category !== null ||
    filters.representativeMembershipId !== null;
  const link = (next: IntelligenceFilters) => `${basePath}${filtersToQuery(next)}`;

  /** Every other filter, so changing one dimension never resets the rest. */
  const carryFor = (changing: string): [string, string][] => {
    const params = new URLSearchParams(filtersToQuery(filters).replace(/^\?/, ""));
    params.delete(changing);
    return [...params.entries()];
  };

  return (
    <div className="ifb" role="group" aria-label="Filters">
      <div className="ifb-group">
        <span className="ifb-label">Period</span>
        {WINDOW_DAYS.map((days) => (
          <Chip
            key={days}
            href={link(withFilter(filters, "days", days))}
            active={filters.days === days}
          >
            {days} days
          </Chip>
        ))}
        <Chip
          href={link(withFilter(filters, "compare", !filters.compare))}
          active={filters.compare}
        >
          vs previous
        </Chip>
      </div>

      {stores.length > CHIP_LIMIT ? (
        <SelectFilter
          basePath={basePath}
          label="Store"
          name="store"
          options={stores}
          selected={filters.storeId}
          carry={carryFor("store")}
        />
      ) : stores.length > 1 ? (
        <div className="ifb-group">
          <span className="ifb-label">Store</span>
          <Chip href={link(withFilter(filters, "storeId", null))} active={filters.storeId === null}>
            All
          </Chip>
          {stores.map((store) => (
            <Chip
              key={store.id}
              href={link(withFilter(filters, "storeId", store.id))}
              active={filters.storeId === store.id}
            >
              {store.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {representatives.length > CHIP_LIMIT ? (
        <SelectFilter
          basePath={basePath}
          label="Salesperson"
          name="rep"
          options={representatives}
          selected={filters.representativeMembershipId}
          carry={carryFor("rep")}
        />
      ) : representatives.length > 1 ? (
        <div className="ifb-group">
          <span className="ifb-label">Salesperson</span>
          <Chip
            href={link(withFilter(filters, "representativeMembershipId", null))}
            active={filters.representativeMembershipId === null}
          >
            All
          </Chip>
          {representatives.map((person) => (
            <Chip
              key={person.id}
              href={link(withFilter(filters, "representativeMembershipId", person.id))}
              active={filters.representativeMembershipId === person.id}
            >
              {person.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {categories.length > CHIP_LIMIT ? (
        <SelectFilter
          basePath={basePath}
          label="Category"
          name="category"
          options={categories.map((category) => ({ id: category, name: category }))}
          selected={filters.category}
          carry={carryFor("category")}
        />
      ) : categories.length > 1 ? (
        <div className="ifb-group">
          <span className="ifb-label">Category</span>
          <Chip
            href={link(withFilter(filters, "category", null))}
            active={filters.category === null}
          >
            All
          </Chip>
          {categories.map((category) => (
            <Chip
              key={category}
              href={link(withFilter(filters, "category", category))}
              active={filters.category === category}
            >
              {category}
            </Chip>
          ))}
        </div>
      ) : null}
      {narrowed ? (
        <Link
          className="ifb-reset"
          href={`${basePath}${filtersToQuery({ ...filters, storeId: null, category: null, representativeMembershipId: null })}`}
        >
          Reset
        </Link>
      ) : null}
    </div>
  );
}
