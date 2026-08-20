import Link from "next/link";

import { DataState, type SlotState } from "@/components/intelligence/data-state";
import { RankedBars } from "@/components/intelligence/interactive-ranked-bar";
import { formatPercent } from "@/components/intelligence/metric-tile";
import { LocalSwitch } from "@/components/intelligence/local-switch";
import { SectionTabs } from "@/components/intelligence/section-tabs";
import { SegmentedBar, type Segment } from "@/components/intelligence/segmented-bar";
import { actionLabel, type ActionCohort } from "@/modules/intelligence/frontline";
import { DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";
import {
  COHORT_LABELS,
  JOURNEY_COHORTS,
  type InterventionRate,
  type JourneyBreakdownRow,
  type JourneyCohortKey,
  type JourneyStage,
  type OutcomeSlice,
  type ProductPath,
  type DiagnosisRow,
} from "@/modules/intelligence/journey";

/**
 * Journey — how far a selected group of customers got.
 *
 * A rail rather than a funnel. A funnel's tapering width asserts that everyone
 * at the top had to pass through every stage, and these conversations did not: a
 * customer can arrive already decided, or leave without ever forming a
 * preference, and neither is a failure.
 *
 * Nothing here is described as broken, lost or dropped. A state we did not
 * observe is a hole in our record, and naming it a failure would be an
 * accusation drawn from our own missing data.
 */

export const BREAKDOWN_TABS = [
  { key: "stores", label: "Stores" },
  { key: "categories", label: "Categories" },
] as const;

const BUSINESS_TONE: Readonly<Record<string, Segment["tone"]>> = {
  sale: "teal",
  no_sale: "coral",
  unknown: "slate",
};

const DECISION_TONE: Readonly<Record<string, Segment["tone"]>> = {
  purchased: "teal",
  follow_up_scheduled: "indigo",
  researching: "amber",
  deferred: "amber",
  rejected: "coral",
  unknown: "slate",
};

/**
 * One cell of the breakdown, suppressed on its own denominator.
 *
 * A percentage from two usable interactions is 0% or 100% and reads, at a
 * glance, as a real difference between stores. The row total is not the guard —
 * a store with fifty conversations can still have two established outcomes — so
 * every cell is judged on the population that could actually answer it.
 */
function Cell({ measure: m }: { measure: Measure }) {
  if (m.value === null || m.observed === 0) {
    return (
      <td className="ip-cell-thin" title="Not measurable in this group">
        —
      </td>
    );
  }
  if (m.observed < DEFAULT_GUARDRAILS.minimumForComparison) {
    return (
      <td className="ip-cell-thin" title={`Only ${m.observed} measurable — too few to compare`}>
        {m.affected ?? 0}/{m.observed}
      </td>
    );
  }
  return (
    <td>
      {formatPercent(m.value)}
      <span className="ip-cell-n"> {m.observed}</span>
    </td>
  );
}

function ProductColumn({
  title,
  list,
  hrefFor,
  emptyState,
}: {
  title: string;
  list: { entries: { value: string; interactions: number; share: number; label: string | null }[] };
  hrefFor: (value: string) => string;
  emptyState: SlotState;
}) {
  return (
    <div className="ip-productcol">
      <h3>{title}</h3>
      {list.entries.length === 0 ? (
        <DataState state={emptyState} compact />
      ) : (
        <ul className="ip-productlist">
          {list.entries.map((entry) => (
            <li key={entry.value}>
              <Link
                className="ip-link ip-tip"
                data-tip={`${entry.value} · ${entry.interactions} interactions · ${Math.round(entry.share * 100)}%`}
                href={hrefFor(entry.value)}
              >
                <span className="ip-product-name">{entry.value}</span>
                <span className="ip-meta">{entry.interactions}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function JourneyView({
  cohortKey,
  cohortSizes,
  stages,
  selectedStage,
  stageHref,
  diagnosis,
  lanes,
  gaps,
  breakdown,
  breakdownDimension,
  breakdownHref,
  outcomes,
  products,
  cohortHref,
  gapHref,
  productHref,
}: {
  cohortKey: JourneyCohortKey;
  cohortSizes: Record<JourneyCohortKey, number>;
  stages: JourneyStage[];
  /** The node whose diagnosis is showing. Page-local; never carried elsewhere. */
  selectedStage: string;
  stageHref: (stageKey: string) => string;
  diagnosis: DiagnosisRow[];
  lanes: InterventionRate[];
  gaps: ActionCohort[];
  breakdown: JourneyBreakdownRow[];
  /** Chosen by the reader; the page never switches dimension on its own. */
  breakdownDimension: string;
  breakdownHref: (dimension: string) => string;
  outcomes: { business: OutcomeSlice[]; decision: OutcomeSlice[] };
  products: ProductPath;
  cohortHref: (key: JourneyCohortKey) => string;
  gapHref: (cohortKey: string) => string;
  productHref: (fieldKey: string, value: string) => string;
}) {
  const size = cohortSizes[cohortKey];
  const pathState: SlotState = size === 0 ? "NO_OBSERVATIONS" : "POPULATED";
  const materialGaps = gaps.filter((gap) => gap.conversationIds.length > 0).slice(0, 4);

  const businessSegments: Segment[] = outcomes.business.map((slice) => ({
    key: slice.key,
    label: slice.label,
    count: slice.count,
    tone: BUSINESS_TONE[slice.key] ?? "slate",
  }));
  const decisionSegments: Segment[] = outcomes.decision.map((slice) => ({
    key: slice.key,
    label: slice.label,
    count: slice.count,
    tone: DECISION_TONE[slice.key] ?? "slate",
  }));

  return (
    <div className="ip-grid12">
      <div className="ip-col-12">
        <SectionTabs
          tabs={JOURNEY_COHORTS.map((key) => ({
            key,
            label: `${COHORT_LABELS[key]} (${cohortSizes[key]})`,
          }))}
          active={cohortKey}
          hrefFor={(key) => cohortHref(key as JourneyCohortKey)}
          label="Cohort"
        />
      </div>

      <section className="ip-panel ip-rail ip-col-12" aria-labelledby="jr-path">
        <div className="ip-section-title">
          <h2 id="jr-path">Decision path</h2>
          <span className="ip-meta">{size} in cohort</span>
        </div>
        {pathState === "POPULATED" ? (
          <>
            <div className="ip-nodes">
              {stages.map((stage) => (
                <Link
                  className={`ip-node ip-node-link${stage.key === selectedStage ? " ip-node--active" : ""}`}
                  key={stage.key}
                  href={stageHref(stage.key)}
                  aria-current={stage.key === selectedStage ? "true" : undefined}
                >
                  <span className="ip-dot" aria-hidden="true" />
                  <strong>{stage.reached}</strong>
                  <span className="ip-label">{stage.label}</span>
                  <small className="ip-meta">
                    {formatPercent(stage.reach.value)} of {stage.reach.observed} measurable
                  </small>
                </Link>
              ))}
            </div>
            <div className="ip-gaps">
              {stages.slice(1).map((stage) =>
                stage.gap ? (
                  <div className="ip-gapcell" key={stage.key}>
                    <span className="ip-gap-observed">
                      {stage.gap.observed} of {stage.gap.measurable} had next state observed ·{" "}
                      {formatPercent(stage.gap.share)}
                    </span>
                    {stage.gap.missing > 0 ? (
                      <Link className="ip-gap" href={gapHref(stage.gap.cohortKey)}>
                        {stage.gap.missing} next-state observations missing →
                      </Link>
                    ) : (
                      <span className="ip-gap ip-gap--none">
                        No next-state observations missing
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="ip-gapcell" key={stage.key}>
                    <DataState state="NOT_SUPPORTED" compact />
                  </div>
                ),
              )}
            </div>
          </>
        ) : (
          <DataState state={pathState} />
        )}
      </section>

      {/* One fixed panel, whichever node is selected. Four expandable nodes
          would move the answer down the page every time somebody looked at a
          different one. */}
      <section className="ip-panel ip-col-6" aria-labelledby="jr-business">
        <div className="ip-section-title">
          <h2 id="jr-business">Business result</h2>
        </div>
        {size === 0 ? (
          <DataState state="NO_OBSERVATIONS" />
        ) : (
          <SegmentedBar segments={businessSegments} unit="interactions" />
        )}
        <p className="ip-note">
          What the store got. Unconfirmed is an outcome we never established, not a no sale.
        </p>
      </section>

      <section className="ip-panel ip-col-6" aria-labelledby="jr-customer">
        <div className="ip-section-title">
          <h2 id="jr-customer">Customer state</h2>
        </div>
        {size === 0 || decisionSegments.length === 0 ? (
          <DataState state={size === 0 ? "NO_OBSERVATIONS" : "NOT_SUPPORTED"} />
        ) : (
          <SegmentedBar segments={decisionSegments} unit="interactions" />
        )}
        <p className="ip-note">
          Where the customer landed — a separate axis from the business result.
        </p>
      </section>

      <section className="ip-panel ip-panel--grouped ip-col-12" aria-labelledby="jr-diagnosis">
        <div className="ip-section-title">
          <h2 id="jr-diagnosis">Diagnosis</h2>
          <span className="ip-meta">Where the next state was not observed</span>
        </div>
        {/* Five rows, always these five, always this order. Sorting by count
            would put a different row at the top each morning and turn a
            reference table into a ranking. */}
        <div className="ip-table-scroll">
          <table className="ip-table">
            <thead>
              <tr>
                <th scope="col">Diagnosis</th>
                <th scope="col">Affected</th>
                <th scope="col">Measurable</th>
                <th scope="col">Rate</th>
                <th scope="col">
                  <span className="ip-visually-hidden">Review</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {diagnosis.map((row) => (
                <tr key={row.cohortKey}>
                  <th scope="row">{row.label}</th>
                  <td>{row.affected}</td>
                  <td>{row.measurable ?? "—"}</td>
                  <td>{row.rate === null ? "—" : formatPercent(row.rate)}</td>
                  <td>
                    {row.affected > 0 ? (
                      <Link className="ip-link" href={gapHref(row.cohortKey)}>
                        Review →
                      </Link>
                    ) : (
                      <span className="ip-meta">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ip-panel ip-col-12" aria-labelledby="jr-products">
        <div className="ip-section-title">
          <h2 id="jr-products">Product path</h2>
          <span className="ip-meta">Click a product for its evidence</span>
        </div>
        <div className="ip-productpath">
          <ProductColumn
            title="Considered"
            list={products.considered}
            hrefFor={(value) => productHref("products_considered", value)}
            emptyState={products.considered.eligible === 0 ? "NOT_SUPPORTED" : "NO_OBSERVATIONS"}
          />
          <ProductColumn
            title="Recommended"
            list={products.recommended}
            hrefFor={(value) => productHref("products_recommended", value)}
            emptyState={products.recommended.eligible === 0 ? "NOT_SUPPORTED" : "NO_OBSERVATIONS"}
          />
          <ProductColumn
            title="Preferred"
            list={products.preferred}
            hrefFor={(value) => productHref("final_preferred_product", value)}
            emptyState={products.preferred.eligible === 0 ? "NOT_SUPPORTED" : "NO_OBSERVATIONS"}
          />
        </div>
        {products.response.entries.length > 0 ? (
          <div className="ip-response-mix">
            <h3>Recommendation response</h3>
            <RankedBars
              entries={products.response.entries}
              eligible={products.response.classified}
              controlled
              unit={`of ${products.response.classified} interactions with a recorded response`}
            />
          </div>
        ) : (
          <DataState state="NOT_SUPPORTED" compact />
        )}
      </section>

      <section className="ip-panel ip-lanes ip-col-12" aria-label="Frontline actions">
        {lanes.map((lane) => (
          <div
            className="ip-pitem ip-tip"
            key={lane.key}
            tabIndex={0}
            data-tip={`${lane.label} · ${formatPercent(lane.measure.value)} · ${lane.measure.affected ?? 0} of ${lane.measure.observed}`}
          >
            <span className="ip-label">{lane.label}</span>
            <strong>{formatPercent(lane.measure.value)}</strong>
            <span className="ip-meta">
              {lane.measure.affected ?? 0} of {lane.measure.observed}
            </span>
          </div>
        ))}
      </section>

      <section className="ip-panel ip-col-12" aria-labelledby="jr-breakdown">
        <LocalSwitch param="dimension" initial={breakdownDimension}>
          <div className="ip-section-title">
            <h2 id="jr-breakdown">Breakdown</h2>
            <SectionTabs
              tabs={BREAKDOWN_TABS}
              active={breakdownDimension}
              hrefFor={breakdownHref}
              label="Breakdown dimension"
            />
          </div>
          {breakdown.length === 0 ? (
            <DataState state="NO_OBSERVATIONS" />
          ) : (
            <div className="ip-table-scroll">
              <table className="ip-table">
                <thead>
                  <tr>
                    <th scope="col">Scope</th>
                    <th scope="col">n</th>
                    <th scope="col">Requirement clear</th>
                    <th scope="col">Preference formed</th>
                    <th scope="col">Commitment</th>
                    <th scope="col">Outcome established</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td>{row.size}</td>
                      <Cell measure={row.requirementClear} />
                      <Cell measure={row.preferenceFormed} />
                      <Cell measure={row.commitment} />
                      <Cell measure={row.outcomeEstablished} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="ip-note">
            Each cell is judged on its own denominator. Below{" "}
            {DEFAULT_GUARDRAILS.minimumForComparison} measurable it shows a count, not a percentage.
          </p>
        </LocalSwitch>
      </section>
    </div>
  );
}
