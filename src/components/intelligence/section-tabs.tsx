import Link from "next/link";

import { TelemetryLink } from "@/components/intelligence/telemetry";
import type { UsageEventName } from "@/modules/intelligence/pilot";

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
  event,
  objectType,
}: {
  tabs: readonly Tab[];
  active: string;
  hrefFor: (key: string) => string;
  label: string;
  /**
   * What selecting a tab here means to the pilot.
   *
   * Optional because the event vocabulary is closed: Demand's Needs and Voice
   * tabs have no name in it, and inventing one to make every control emit
   * something would put a name in the pilot data that no analysis expects.
   */
  event?: UsageEventName;
  objectType?: string;
}) {
  return (
    <div className="ip-tabs" role="group" aria-label={label}>
      {tabs.map((tab) => {
        const shared = {
          className: `ip-tab${tab.key === active ? " ip-tab--active" : ""}`,
          href: hrefFor(tab.key),
          "aria-current": tab.key === active ? ("true" as const) : undefined,
          // Picked up by LocalSwitch, which shows the matching panel without a
          // round trip. Without JavaScript this stays an ordinary link.
          "data-local-key": tab.key,
        };
        return event ? (
          <TelemetryLink
            key={tab.key}
            {...shared}
            telemetry={{ event, objectType, objectKey: tab.key }}
          >
            {tab.label}
          </TelemetryLink>
        ) : (
          <Link key={tab.key} {...shared}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
