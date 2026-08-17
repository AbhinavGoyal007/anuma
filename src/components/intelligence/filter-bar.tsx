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
}: {
  basePath: string;
  filters: IntelligenceFilters;
  stores: FilterOption[];
  categories: string[];
}) {
  const link = (next: IntelligenceFilters) => `${basePath}${filtersToQuery(next)}`;

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

      {stores.length > 1 ? (
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

      {categories.length > 1 ? (
        <div className="ifb-group">
          <span className="ifb-label">Category</span>
          <Chip
            href={link(withFilter(filters, "category", null))}
            active={filters.category === null}
          >
            All
          </Chip>
          {categories.slice(0, 6).map((category) => (
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
    </div>
  );
}
