import Link from "next/link";

/**
 * One panel at a time, addressed by URL.
 *
 * Tabs rather than six stacked panels because the scroll budget is part of the
 * contract: the answer to the page's question has to be in the first viewport,
 * and a page that stacks every list pushes it below three folds of detail
 * nobody asked for yet.
 *
 * Links rather than buttons so each tab is a real address — shareable, and
 * working before any JavaScript arrives.
 */

export type Tab = { key: string; label: string };

export function SectionTabs({
  tabs,
  active,
  hrefFor,
  label,
}: {
  tabs: readonly Tab[];
  active: string;
  hrefFor: (key: string) => string;
  label: string;
}) {
  return (
    <div className="ip-tabs" role="group" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          className={`ip-tab${tab.key === active ? " ip-tab--active" : ""}`}
          href={hrefFor(tab.key)}
          aria-current={tab.key === active ? "true" : undefined}
          // Picked up by LocalSwitch, which shows the matching panel without a
          // round trip. Without JavaScript this stays an ordinary link.
          data-local-key={tab.key}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
