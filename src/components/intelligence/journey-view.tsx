import Link from "next/link";

import type { ActionCohort } from "@/modules/intelligence/frontline";
import { DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";
import {
  COHORT_LABELS,
  type OutcomeSlice,
  JOURNEY_COHORTS,
  type InterventionRate,
  type JourneyBreakdownRow,
  type JourneyCohortKey,
  type JourneyStage,
} from "@/modules/intelligence/journey";

/**
 * How far the selected group of customers got.
 *
 * A horizontal rail rather than a funnel. A funnel's tapering width asserts that
 * everyone at the top had to pass through every stage, and these conversations
 * did not: a customer can arrive already decided, or leave without ever forming
 * a preference, and neither is a failure. The rail keeps every stage the same
 * width and puts the number in the text, which is the weaker and truer claim.
 *
 * The gap between two stages is the clickable part, because the interesting
 * question is never "how many reached commitment" but "who stopped just before
 * it, and what did they say".
 */

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

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
      <td className="jr-cell-thin" title="Not measurable in this group">
        —
      </td>
    );
  }
  if (m.observed < DEFAULT_GUARDRAILS.minimumForComparison) {
    return (
      <td className="jr-cell-thin" title={`Only ${m.observed} measurable — too few to compare`}>
        {m.affected ?? 0}/{m.observed}
      </td>
    );
  }
  return (
    <td>
      {percent(m.value)}
      <span className="jr-cell-n"> {m.observed}</span>
    </td>
  );
}

/**
 * One composition, as a single 100% bar.
 *
 * The states are mutually exclusive and there are few of them, which is the one
 * case a stacked bar reads better than separate bars. Every segment carries its
 * own text label, so colour is never the only thing distinguishing a sale from
 * an outcome nobody established.
 */
function OutcomeStrip({
  title,
  slices,
  note,
}: {
  title: string;
  slices: OutcomeSlice[];
  note: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  if (total === 0) return null;
  return (
    <div className="dm-panel">
      <h3>{title}</h3>
      <div
        className="os-bar"
        role="img"
        aria-label={slices.map((s) => `${s.label} ${s.count}`).join(", ")}
      >
        {slices
          .filter((slice) => slice.count > 0)
          .map((slice) => (
            <span
              key={slice.key}
              className={`os-seg os-seg--${slice.key}`}
              style={{ width: `${(slice.count / total) * 100}%` }}
            />
          ))}
      </div>
      <ul className="os-key">
        {slices
          .filter((slice) => slice.count > 0)
          .map((slice) => (
            <li key={slice.key}>
              <span className={`os-swatch os-seg--${slice.key}`} aria-hidden="true" />
              {slice.label} <strong>{slice.count}</strong>
              <span className="os-share">{percent(slice.share)}</span>
            </li>
          ))}
      </ul>
      <p className="fl-note">{note}</p>
    </div>
  );
}

function Sample({ measure: m }: { measure: Measure }) {
  const thin = m.observed > 0 && m.observed < DEFAULT_GUARDRAILS.minimumForConfidentDisplay;
  return (
    <span className="jr-sample">
      {m.affected ?? 0} of {m.observed}
      {thin ? <span className="fl-lowsample">small sample</span> : null}
    </span>
  );
}

export function JourneyView({
  cohortKey,
  cohortSizes,
  stages,
  lanes,
  leakage,
  breakdown,
  breakdownLabel,
  outcomes,
  cohortQuery,
  periodLabel,
}: {
  cohortKey: JourneyCohortKey;
  cohortSizes: Record<JourneyCohortKey, number>;
  stages: JourneyStage[];
  lanes: InterventionRate[];
  leakage: ActionCohort[];
  breakdown: JourneyBreakdownRow[];
  breakdownLabel: string;
  outcomes: { business: OutcomeSlice[]; decision: OutcomeSlice[] };
  cohortQuery: (key: JourneyCohortKey) => string;
  periodLabel: string;
}) {
  const size = cohortSizes[cohortKey];
  // The cohort link points at the journey page; a group link points at the
  // shared drill-down carrying the same query, so the set opened is the set
  // counted.
  // Groups whose cells could carry a rate at all. Below two of them the section
  // stops presenting itself as a comparison.
  const comparable = breakdown.filter((row) =>
    [row.requirementClear, row.preferenceFormed, row.commitment, row.sale].some(
      (m) => m.observed >= DEFAULT_GUARDRAILS.minimumForComparison,
    ),
  );

  const gapLink = (key: string) =>
    `/intelligence/cohort/${key}${cohortQuery(cohortKey).replace("/intelligence/journey", "")}`;

  return (
    <>
      <div className="jr-cohorts" role="group" aria-label="Cohort">
        <span className="ifb-label">Cohort</span>
        {JOURNEY_COHORTS.map((key) => (
          <Link
            key={key}
            className={`ifb-chip${key === cohortKey ? " ifb-chip--active" : ""}`}
            href={cohortQuery(key)}
            aria-current={key === cohortKey ? "true" : undefined}
          >
            {COHORT_LABELS[key]} ({cohortSizes[key]})
          </Link>
        ))}
      </div>

      <p className="fl-note">
        Observed within the selected group in {periodLabel}. These states are not a sequence
        everyone passes through — a customer can show a buying signal without ever settling on one
        product, so a later state can hold more interactions than an earlier one. Each gap counts
        exactly the interactions its link opens.
      </p>

      {size === 0 ? (
        <section className="fl-empty">
          <p>Nobody in this group in {periodLabel}.</p>
          <p className="fl-empty-note">
            Try a wider group above, or a longer period. On this data almost every arrival is
            classified exploratory, so the decided-arrival groups are small.
          </p>
        </section>
      ) : (
        <>
          <ol className="jr-rail">
            {stages.map((stage, index) => (
              <li key={stage.key}>
                {index > 0 ? (
                  <div className="jr-gap">
                    {stage.lost > 0 && stage.gapCohortKey ? (
                      <Link className="jr-gap-link" href={gapLink(stage.gapCohortKey)}>
                        {stage.lost} without this next state observed →
                      </Link>
                    ) : (
                      <span className="jr-gap-none">
                        {stage.lost === 0
                          ? "No missing next-state observations"
                          : `${stage.lost} not observed`}
                      </span>
                    )}
                    {stage.progression?.value !== null && stage.progression ? (
                      <span className="jr-progress">
                        {percent(stage.progression.value)} of those observed in the previous state
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="jr-stage">
                  <p className="jr-stage-label">{stage.label}</p>
                  <p className="jr-stage-count">
                    <strong>{stage.reached}</strong>
                    <span className="jr-stage-share">{percent(stage.reach.value)}</span>
                  </p>
                  <p className="jr-stage-meaning">{stage.meaning}</p>
                  <Sample measure={stage.reach} />
                </div>
              </li>
            ))}
          </ol>

          <section className="fl-section" aria-labelledby="jr-outcome">
            <h2 id="jr-outcome">How these interactions ended</h2>
            <div className="dm-grid">
              <OutcomeStrip
                title="Business result"
                slices={outcomes.business}
                note="What the store got. Unconfirmed is an outcome we never established, which is not the same as a no sale."
              />
              <OutcomeStrip
                title="Customer closing state"
                slices={outcomes.decision}
                note="Where the customer landed. A customer who agreed to come back is a follow-up, not a failure."
              />
            </div>
          </section>

          <section className="fl-section" aria-labelledby="jr-lane">
            <h2 id="jr-lane">What the representative did alongside</h2>
            <p className="fl-note">
              These are not stages the customer passed through. They sit beside the journey because
              placing them inside it would imply an order that does not exist.
            </p>
            <dl className="fl-rates">
              {lanes.map((lane) => (
                <div key={lane.key} className="fl-rate">
                  <dt>{lane.label}</dt>
                  <dd>
                    <strong>{percent(lane.measure.value)}</strong>
                    <p className="fl-sample">
                      {lane.measure.affected ?? 0} of {lane.measure.observed}
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="fl-section" aria-labelledby="jr-leak">
            <h2 id="jr-leak">Where the next state was not observed</h2>
            {leakage.length === 0 ? (
              <p className="fl-none">
                Every state that could be observed was. With {size} interactions that reads as “none
                surfaced”, not “none exist”.
              </p>
            ) : (
              <ul className="fl-actions">
                {leakage.map((cohort) => (
                  <li key={cohort.key}>
                    <p className="fl-action-headline">
                      <strong>{cohort.conversationIds.length}</strong> {cohort.headline}.
                    </p>
                    <p className="fl-action-reason">{cohort.reason}</p>
                    <Link className="fl-action-link" href={gapLink(cohort.key)}>
                      Review {cohort.conversationIds.length} interaction
                      {cohort.conversationIds.length === 1 ? "" : "s"} →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="fl-section" aria-labelledby="jr-where">
            <h2 id="jr-where">
              {comparable.length >= 2
                ? "Where the journey differs"
                : `Journey by ${breakdownLabel.toLowerCase()}`}
            </h2>
            {breakdown.length < 2 ? (
              <p className="fl-none">
                Only one {breakdownLabel.toLowerCase()} in this group; nothing to compare.
              </p>
            ) : (
              <>
                {comparable.length < 2 ? (
                  <p className="fl-note">
                    No {breakdownLabel.toLowerCase()} has enough interactions to compare rates
                    against another, so counts are shown instead. A rate from two conversations is
                    0% or 100% and would read as a performance difference it cannot support.
                  </p>
                ) : null}
                <table className="fl-table">
                  <thead>
                    <tr>
                      <th scope="col">{breakdownLabel}</th>
                      <th scope="col">n</th>
                      <th scope="col">Requirement clear</th>
                      <th scope="col">Preference formed</th>
                      <th scope="col">Commitment signal</th>
                      <th scope="col">Sale</th>
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
                        <Cell measure={row.sale} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="fl-note">
              Each cell is judged on its own denominator, not on the row total: a store with fifty
              conversations can still have only two usable outcomes. Cells below{" "}
              {DEFAULT_GUARDRAILS.minimumForComparison} show the count rather than a percentage.
            </p>
          </section>
        </>
      )}
    </>
  );
}
