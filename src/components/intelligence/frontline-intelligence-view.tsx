import Link from "next/link";

import type {
  ActionCohort,
  FrontlineMetrics,
  OutcomeAssociationResult,
  StateSlice,
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
      {thin ? <span className="fl-lowsample">small sample</span> : null}
      {lowCoverage
        ? ` · measurable in ${m.observed} of ${m.eligible} (${Math.round((m.coverage ?? 0) * 100)}% coverage)`
        : ""}
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

/** One column of the execution pathway. */
function Stage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fp-stage">
      <p className="fp-stage-title">{title}</p>
      <dl className="fp-stage-metrics">{children}</dl>
    </div>
  );
}

/** A 100% bar over a few mutually exclusive states, labelled in text. */
function Composition({
  title,
  slices,
  unit,
  note,
}: {
  title: string;
  slices: StateSlice[];
  unit: string;
  note: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  return (
    <div className="dm-panel">
      <h3>{title}</h3>
      {total === 0 ? (
        <p className="fl-none">Nothing recorded in this period.</p>
      ) : (
        <>
          <div
            className="os-bar"
            role="img"
            aria-label={slices.map((slice) => `${slice.label} ${slice.count}`).join(", ")}
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
            {slices.map((slice) => (
              <li key={slice.key}>
                <span className={`os-swatch os-seg--${slice.key}`} aria-hidden="true" />
                {slice.label} <strong>{slice.count}</strong>
                <span className="os-share">{percent(slice.count / total)}</span>
              </li>
            ))}
          </ul>
          <p className="fl-sample">
            {total} {unit}
          </p>
        </>
      )}
      <p className="fl-note">{note}</p>
    </div>
  );
}

/**
 * Two rates for one behaviour, on a shared scale.
 *
 * A dumbbell rather than four columns of numbers: the distance between the dots
 * is the comparison, and reading a gap is faster and less error-prone than
 * subtracting two percentages in your head. Both ends are labelled, so the
 * chart is legible without colour.
 *
 * Only ever rendered on a sample that already cleared the guardrail — the
 * suppressed case returns before this is reached, because a persuasive shape
 * drawn on one sale and eight no-sales is worse than a table of the same
 * numbers.
 */
function Dumbbell({ rows }: { rows: OutcomeAssociationResult["rows"] }) {
  return (
    <ul className="db-list">
      {rows.map((row) => {
        const sale = (row.saleRate ?? 0) * 100;
        const noSale = (row.noSaleRate ?? 0) * 100;
        const left = Math.min(sale, noSale);
        const width = Math.abs(sale - noSale);
        return (
          <li key={row.behaviourKey} className="db-row">
            <span className="db-label">{row.label}</span>
            <span
              className="db-track"
              role="img"
              aria-label={`${row.label}: ${Math.round(sale)}% in sales, ${Math.round(noSale)}% in non-sales`}
            >
              <span className="db-connector" style={{ left: `${left}%`, width: `${width}%` }} />
              <span className="db-dot db-dot--nosale" style={{ left: `${noSale}%` }} />
              <span className="db-dot db-dot--sale" style={{ left: `${sale}%` }} />
            </span>
            <span className="db-values">
              <span className="db-v db-v--sale">{Math.round(sale)}%</span>
              <span className="db-v db-v--nosale">{Math.round(noSale)}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function FrontlineIntelligenceView({
  metrics,
  compositions,
  previousMetrics,
  cohorts,
  associations,
  analysed,
  withoutMetrics,
  periodLabel,
  cohortQuery,
}: {
  metrics: FrontlineMetrics;
  compositions: { objection: StateSlice[]; finance: StateSlice[] };
  previousMetrics: FrontlineMetrics | null;
  cohorts: ActionCohort[];
  associations: OutcomeAssociationResult;
  analysed: number;
  /** Null where a category is selected and the count cannot be stated honestly. */
  withoutMetrics: number | null;
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
                  href={`/intelligence/cohort/${cohort.key}${cohortQuery}`}
                >
                  Review {cohort.conversationIds.length} interaction
                  {cohort.conversationIds.length === 1 ? "" : "s"} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fl-section" aria-labelledby="fl-path">
        <h2 id="fl-path">How the floor is executing</h2>
        <p className="fl-note">
          Grouped by the job each behaviour does, not by an order anyone is expected to follow. A
          conversation can resolve an objection before it recommends anything.
        </p>
        <div className="fp-grid">
          <Stage title="Understand">
            <Rate
              metricKey="finance_question_response"
              measure={metrics.financeQuestionResponse}
              previous={before("financeQuestionResponse")}
            />
          </Stage>
          <Stage title="Recommend">
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
            <Rate metricKey="demo_rate" measure={metrics.demoRate} previous={before("demoRate")} />
            <Rate
              metricKey="alternative_rate"
              measure={metrics.alternativeRate}
              previous={before("alternativeRate")}
            />
          </Stage>
          <Stage title="Resolve">
            <Rate
              metricKey="full_objection_handling"
              measure={metrics.fullObjectionHandling}
              previous={before("fullObjectionHandling")}
            />
            <Rate
              metricKey="proactive_offer"
              measure={metrics.proactiveOffer}
              previous={before("proactiveOffer")}
            />
          </Stage>
          <Stage title="Expand">
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
          </Stage>
          <Stage title="Close">
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
          </Stage>
        </div>
      </section>

      <section className="fl-section" aria-labelledby="fl-friction">
        <h2 id="fl-friction">How friction was answered</h2>
        <div className="dm-grid">
          <Composition
            title="Objection responses"
            slices={compositions.objection}
            unit="objection responses judged"
            note="Counted per objection, not per conversation. Fully addressed means the concern was answered, not that the customer was persuaded."
          />
          <Composition
            title="Finance questions"
            slices={compositions.finance}
            unit="interactions where a finance question was asked"
            note="No response status recorded is an absence in our record, not proof that nobody replied."
          />
        </div>
      </section>

      <section className="fl-section" aria-labelledby="fl-association">
        <h2 id="fl-association">What sales and non-sales looked different on</h2>
        {associations.strength === "suppressed" ? (
          <p className="fl-none">
            Comparison suppressed — {associations.saleN} confirmed sale
            {associations.saleN === 1 ? "" : "s"} and {associations.noSaleN} confirmed no-sale
            {associations.noSaleN === 1 ? "" : "s"}. At least{" "}
            {DEFAULT_GUARDRAILS.minimumForComparison} established outcomes are needed in each group
            before behaviours can be compared. Interactions whose outcome was never settled belong
            to neither group.
          </p>
        ) : (
          <>
            <p className="db-legend">
              <span className="db-swatch db-dot--sale" aria-hidden="true" /> in sales (
              {associations.saleN}) &nbsp;
              <span className="db-swatch db-dot--nosale" aria-hidden="true" /> in non-sales (
              {associations.noSaleN})
            </p>
            <Dumbbell rows={associations.rows} />
          </>
        )}
        {associations.strength !== "suppressed" ? (
          <p className="fl-note">
            Observed together, in {associations.saleN} sales and {associations.noSaleN} non-sales
            {associations.strength === "directional" ? ", directional only at this sample" : ""}.
            These conversations were recorded, not controlled, so a behaviour being more common in
            sales does not mean it caused them.
          </p>
        ) : null}
      </section>

      {withoutMetrics !== null && withoutMetrics > 0 ? (
        <p className="fl-footnote">
          {withoutMetrics} conversation{withoutMetrics === 1 ? "" : "s"} in this period could not be
          included because analysis has not finished for them.
        </p>
      ) : null}
    </>
  );
}
