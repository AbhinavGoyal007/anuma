import Link from "next/link";

import type {
  ActionCohort,
  FrontlineMetrics,
  OutcomeAssociation,
} from "@/modules/intelligence/frontline";
import { change, DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";
import { metric } from "@/modules/intelligence/metric-registry";

/**
 * Where frontline execution needs attention.
 *
 * Ordered the way a manager reads rather than the way the data is shaped: the
 * interactions that went wrong first, the rates that explain them second, and
 * the behaviour-versus-outcome comparison last, because that one invites a
 * causal reading and belongs after the reader has the context to resist it.
 *
 * Every figure carries its denominator. A rate with a thin denominator is shown
 * with that stated rather than suppressed — a manager with seventeen
 * conversations still wants to see them, and the honest response is to say how
 * few there are, not to render an empty page.
 */

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** The sample note that travels with every rate. */
function Denominator({ measure: m }: { measure: Measure }) {
  if (m.value === null) {
    return <p className="fl-sample">Not measured in this period</p>;
  }
  const thin = m.observed < DEFAULT_GUARDRAILS.minimumForConfidentDisplay;
  const lowCoverage =
    m.coverage !== null && m.coverage < DEFAULT_GUARDRAILS.minimumCoverage && m.eligible > 0;
  return (
    <p className={`fl-sample${thin ? " fl-sample--thin" : ""}`}>
      {m.affected ?? 0} of {m.observed}
      {thin ? " · directional only" : ""}
      {lowCoverage ? ` · ${Math.round((m.coverage ?? 0) * 100)}% of interactions carried this` : ""}
    </p>
  );
}

function Rate({
  metricKey,
  measure: m,
  previous,
}: {
  metricKey: string;
  measure: Measure;
  previous?: Measure | null;
}) {
  const definition = metric(metricKey);
  // A delta is shown only when both periods independently clear the bar. A solid
  // month measured against six conversations is not a trend, and printing the
  // arrow anyway is how a dashboard teaches people to distrust it.
  const delta = previous ? change(m, previous) : null;
  return (
    <div className="fl-rate">
      <dt>{definition.label}</dt>
      <dd>
        <strong>{percent(m.value)}</strong>
        {delta?.comparable && delta.deltaPoints !== null ? (
          <span className="fl-delta">
            {delta.deltaPoints > 0 ? "+" : ""}
            {Math.round(delta.deltaPoints)}pp
          </span>
        ) : null}
        <Denominator measure={m} />
        {definition.provisional ? (
          <span className="fl-provisional" title={definition.provisional}>
            approximate
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export function FrontlineIntelligenceView({
  metrics,
  previousMetrics,
  cohorts,
  associations,
  analysed,
  withoutMetrics,
  periodLabel,
  cohortQuery,
}: {
  metrics: FrontlineMetrics;
  previousMetrics: FrontlineMetrics | null;
  cohorts: ActionCohort[];
  associations: OutcomeAssociation[];
  analysed: number;
  withoutMetrics: number;
  periodLabel: string;
  cohortQuery: string;
}) {
  const before = (key: keyof FrontlineMetrics) => previousMetrics?.[key] ?? null;
  if (analysed === 0) {
    return (
      <section className="fl-empty">
        <p>No analysed interactions in {periodLabel}.</p>
        <p className="fl-empty-note">
          Conversations appear here once they have been transcribed, speaker-mapped and analysed.
        </p>
      </section>
    );
  }

  const attention = cohorts.slice(0, 4);

  return (
    <>
      <section className="fl-section" aria-labelledby="fl-attention">
        <h2 id="fl-attention">Where execution needs attention</h2>
        {attention.length === 0 ? (
          <p className="fl-none">
            No execution gaps found in {analysed} interactions. With a sample this size that is
            worth reading as &ldquo;none surfaced&rdquo;, not &ldquo;none exist&rdquo;.
          </p>
        ) : (
          <ul className="fl-actions">
            {attention.map((cohort) => (
              <li key={cohort.key}>
                <p className="fl-action-headline">
                  <strong>{cohort.conversationIds.length}</strong> {cohort.headline}.
                </p>
                <p className="fl-action-reason">{cohort.reason}</p>
                <Link
                  className="fl-action-link"
                  href={`/intelligence/frontline/cohort/${cohort.key}${cohortQuery}`}
                >
                  Review {cohort.conversationIds.length} interaction
                  {cohort.conversationIds.length === 1 ? "" : "s"} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fl-section" aria-labelledby="fl-pulse">
        <h2 id="fl-pulse">How the floor is executing</h2>
        <dl className="fl-rates">
          <Rate
            metricKey="recommendation_rate"
            measure={metrics.recommendationRate}
            previous={before("recommendationRate")}
          />
          <Rate
            metricKey="recommendation_rationale"
            measure={metrics.recommendationRationale}
            previous={before("recommendationRationale")}
          />
          <Rate
            metricKey="full_objection_handling"
            measure={metrics.fullObjectionHandling}
            previous={before("fullObjectionHandling")}
          />
          <Rate metricKey="demo_rate" measure={metrics.demoRate} previous={before("demoRate")} />
          <Rate
            metricKey="close_after_commitment"
            measure={metrics.closeAfterCommitment}
            previous={before("closeAfterCommitment")}
          />
          <Rate
            metricKey="next_action_capture"
            measure={metrics.nextActionCapture}
            previous={before("nextActionCapture")}
          />
        </dl>
      </section>

      <section className="fl-section" aria-labelledby="fl-commercial">
        <h2 id="fl-commercial">Are commercial openings being used?</h2>
        <dl className="fl-rates">
          <Rate
            metricKey="cross_sell_rate"
            measure={metrics.crossSellRate}
            previous={before("crossSellRate")}
          />
          <Rate
            metricKey="upsell_rate"
            measure={metrics.upsellRate}
            previous={before("upsellRate")}
          />
          <Rate
            metricKey="finance_offer_gap"
            measure={metrics.financeOfferGap}
            previous={before("financeOfferGap")}
          />
        </dl>
        <p className="fl-note">
          The finance figure is the gap, not the coverage: it counts customers who asked about
          paying monthly and got no offer back. It is the one number here meant to reach zero.
        </p>
      </section>

      <section className="fl-section" aria-labelledby="fl-association">
        <h2 id="fl-association">What sales and non-sales looked different on</h2>
        {associations.every((row) => row.differencePoints === null) ? (
          <p className="fl-none">
            Not enough interactions with an established outcome to compare. Both a sale group and a
            no-sale group are needed, and interactions whose outcome was never settled belong to
            neither.
          </p>
        ) : (
          <table className="fl-table">
            <thead>
              <tr>
                <th scope="col">Behaviour</th>
                <th scope="col">In sales</th>
                <th scope="col">In non-sales</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {associations.map((row) => (
                <tr key={row.behaviourKey}>
                  <th scope="row">{row.label}</th>
                  <td>{percent(row.saleRate)}</td>
                  <td>{percent(row.noSaleRate)}</td>
                  <td>
                    {row.differencePoints === null
                      ? "—"
                      : `${row.differencePoints > 0 ? "+" : ""}${Math.round(row.differencePoints)}pp`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="fl-note">
          Observed together, in {associations[0]?.saleN ?? 0} sales and{" "}
          {associations[0]?.noSaleN ?? 0} non-sales. These conversations were recorded, not
          controlled, so a behaviour being more common in sales does not mean it caused them.
        </p>
      </section>

      {withoutMetrics > 0 ? (
        <p className="fl-footnote">
          {withoutMetrics} conversation{withoutMetrics === 1 ? "" : "s"} in this period could not be
          included because analysis has not finished for them.
        </p>
      ) : null}
    </>
  );
}
