import Link from "next/link";

import { DataState, stateFor, type SlotState } from "@/components/intelligence/data-state";
import { LocalSwitch } from "@/components/intelligence/local-switch";
import { TelemetryLink } from "@/components/intelligence/telemetry";
import { RankedBars } from "@/components/intelligence/interactive-ranked-bar";
import { Delta, formatPercent, tipText } from "@/components/intelligence/metric-tile";
import { QuadrantBenchmark } from "@/components/intelligence/quadrant-benchmark";
import { SegmentedBar, type Segment } from "@/components/intelligence/segmented-bar";
import type { RankedShare } from "@/modules/intelligence/demand";
import {
  actionLabel,
  type ActionCohort,
  type ExpandDetail,
  type FrontlineMetrics,
  type OfferDetail,
  type OutcomeAssociationResult,
  type StateSlice,
} from "@/modules/intelligence/frontline";
import { DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";
import { metric } from "@/modules/intelligence/metric-registry";

/**
 * Frontline — three actions, five stages, one detail panel.
 *
 * The five stages are always all five, whatever the data holds. Grouped by the
 * job each behaviour does rather than by an order anyone is expected to follow:
 * a conversation can resolve an objection before it recommends anything.
 *
 * Only one stage's detail renders at a time. Five expanded panels is a report,
 * and the answer to "where is execution weak" would then sit four folds below
 * the question.
 */

export const STAGES = [
  { key: "understand", label: "Understand" },
  { key: "recommend", label: "Recommend" },
  { key: "resolve", label: "Resolve" },
  { key: "expand", label: "Expand" },
  { key: "close", label: "Close" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export type RankedList = {
  entries: RankedShare[];
  eligible: number;
  observed: number;
  coverage: number | null;
};
export type Distribution = { entries: RankedShare[]; classified: number };

export type FrontlineDetail = {
  questions: RankedList;
  questionComposition: StateSlice[];
  recommended: RankedList;
  reasons: RankedList;
  recommendationResponse: Distribution;
  objection: StateSlice[];
  finance: StateSlice[];
  offer: OfferDetail;
  expand: ExpandDetail;
  commitment: RankedList;
  closes: RankedList;
  nextAction: RankedList;
};

/** The metric keys each stage summarises, fixed by the contract. */
const STAGE_SUMMARY: Readonly<Record<StageKey, (keyof FrontlineMetrics)[]>> = {
  understand: ["questionResponseCoverage", "financeQuestionResponse"],
  recommend: ["recommendationRate", "recommendationRationale", "demoRate"],
  resolve: ["fullObjectionHandling", "financeQuestionResponse", "proactiveOffer"],
  expand: ["crossSellRate", "upsellRate"],
  close: ["closeAttemptRate", "closeAfterCommitment", "nextActionCapture"],
};

/** The metric registry key each measure is described by. */
const METRIC_KEYS: Readonly<Record<keyof FrontlineMetrics, string>> = {
  questionResponseCoverage: "question_response_coverage",
  closeAttemptRate: "close_attempt_rate",
  recommendationRate: "recommendation_rate",
  recommendationRationale: "recommendation_rationale",
  fullObjectionHandling: "full_objection_handling",
  demoRate: "demo_rate",
  alternativeRate: "alternative_rate",
  financeDemand: "finance_demand",
  financeQuestionResponse: "finance_question_response",
  proactiveOffer: "proactive_offer",
  crossSellRate: "cross_sell_rate",
  upsellRate: "upsell_rate",
  closeAfterCommitment: "close_after_commitment",
  nextActionCapture: "next_action_capture",
};

function Rate({
  metricKey,
  measure: m,
  previous,
}: {
  metricKey: keyof FrontlineMetrics;
  measure: Measure;
  previous: Measure | null;
}) {
  const definition = metric(METRIC_KEYS[metricKey]);
  const state = stateFor(m);
  return (
    <div
      className="ip-rate ip-tip"
      tabIndex={0}
      data-tip={tipText({
        label: definition.label,
        value: formatPercent(m.value),
        measure: m,
        previous,
      })}
    >
      <span className="ip-label">{definition.label}</span>
      {state === "POPULATED" ? (
        <>
          <strong>{formatPercent(m.value)}</strong>
          <Delta measure={m} previous={previous} />
          <span className="ip-meta">
            {m.affected ?? 0} of {m.observed}
            {definition.provisional ? " · approximate" : ""}
          </span>
        </>
      ) : (
        <DataState state={state} compact />
      )}
    </div>
  );
}

function ListSlot({
  list,
  unit,
  controlled,
}: {
  list: RankedList | Distribution;
  unit: string;
  controlled?: boolean;
}) {
  // Eligible decides whether the field exists at all; observed is what the
  // shares are taken over. Conflating them made an unreadable recording look
  // like a customer who wanted none of these things.
  const eligible = "eligible" in list ? list.eligible : list.classified;
  const observed = "observed" in list ? list.observed : list.classified;
  const state: SlotState =
    eligible === 0 ? "NOT_SUPPORTED" : list.entries.length === 0 ? "NO_OBSERVATIONS" : "POPULATED";
  return state === "POPULATED" ? (
    <RankedBars
      entries={list.entries}
      distinct={"distinct" in list ? (list.distinct as number) : undefined}
      observed={observed}
      coverage={"coverage" in list ? list.coverage : null}
      unit={unit}
      controlled={controlled}
      limit={6}
    />
  ) : (
    <DataState state={state} compact />
  );
}

function CompositionSlot({
  slices,
  unit,
  tones,
}: {
  slices: StateSlice[];
  unit: string;
  tones: Record<string, Segment["tone"]>;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  if (total === 0) return <DataState state="NO_OBSERVATIONS" compact />;
  return (
    <SegmentedBar
      segments={slices.map((slice) => ({
        key: slice.key,
        label: slice.label,
        count: slice.count,
        tone: tones[slice.key] ?? "slate",
      }))}
      unit={unit}
    />
  );
}

const RESPONSE_TONES: Record<string, Segment["tone"]> = {
  full: "teal",
  partial: "amber",
  none: "coral",
  uncertain: "slate",
  unrecorded: "slate",
  recorded: "teal",
};

function StageDetail({
  stage,
  metrics,
  previous,
  detail,
}: {
  stage: StageKey;
  metrics: FrontlineMetrics;
  previous: FrontlineMetrics | null;
  detail: FrontlineDetail;
}) {
  const before = (key: keyof FrontlineMetrics) => previous?.[key] ?? null;

  if (stage === "understand") {
    return (
      <div className="ip-subgrid">
        <div className="ip-subpanel">
          <h3>Question topics</h3>
          <ListSlot list={detail.questions} unit="interactions asked about this" />
        </div>
        <div className="ip-subpanel">
          <h3>Response status</h3>
          <CompositionSlot
            slices={detail.questionComposition}
            unit="interactions where a question was asked"
            tones={RESPONSE_TONES}
          />
        </div>
        <div className="ip-subpanel">
          <h3>Finance</h3>
          <CompositionSlot
            slices={detail.finance}
            unit="interactions where a finance question was asked"
            tones={RESPONSE_TONES}
          />
          <p className="ip-note">
            No response status recorded is an absence in our record, not proof that nobody replied.
          </p>
        </div>
      </div>
    );
  }

  if (stage === "recommend") {
    return (
      <>
        <div className="ip-rate-row">
          <Rate
            metricKey="recommendationRate"
            measure={metrics.recommendationRate}
            previous={before("recommendationRate")}
          />
          <Rate
            metricKey="recommendationRationale"
            measure={metrics.recommendationRationale}
            previous={before("recommendationRationale")}
          />
          <Rate metricKey="demoRate" measure={metrics.demoRate} previous={before("demoRate")} />
          <Rate
            metricKey="alternativeRate"
            measure={metrics.alternativeRate}
            previous={before("alternativeRate")}
          />
        </div>
        <div className="ip-subgrid">
          <div className="ip-subpanel">
            <h3>Products recommended</h3>
            <ListSlot list={detail.recommended} unit="interactions recommended this" />
          </div>
          <div className="ip-subpanel">
            <h3>Reasons given</h3>
            <ListSlot list={detail.reasons} unit="interactions gave this reason" />
          </div>
          <div className="ip-subpanel">
            <h3>Customer response</h3>
            <ListSlot
              list={detail.recommendationResponse}
              controlled
              unit="interactions with a recorded response"
            />
          </div>
        </div>
      </>
    );
  }

  if (stage === "resolve") {
    return (
      <div className="ip-subgrid">
        <div className="ip-subpanel">
          <h3>Objection response</h3>
          <CompositionSlot
            slices={detail.objection}
            unit="objection responses judged"
            tones={RESPONSE_TONES}
          />
          <p className="ip-note">
            Counted per objection, not per conversation. Fully addressed means the concern was
            answered, not that the customer was persuaded.
          </p>
        </div>
        <div className="ip-subpanel">
          <h3>Finance</h3>
          <CompositionSlot
            slices={detail.finance}
            unit="interactions where a finance question was asked"
            tones={RESPONSE_TONES}
          />
        </div>
        <div className="ip-subpanel">
          <h3>Commercial offer</h3>
          <ListSlot list={detail.offer.made} unit="interactions carried this offer" />
          <ListSlot
            list={detail.offer.response}
            controlled
            unit="interactions with a recorded offer response"
          />
        </div>
      </div>
    );
  }

  if (stage === "expand") {
    return (
      <div className="ip-subgrid">
        <div className="ip-subpanel">
          <h3>Cross-sell pitched</h3>
          <ListSlot list={detail.expand.crossSell} unit="interactions pitched this" />
        </div>
        <div className="ip-subpanel">
          <h3>Upsell pitched</h3>
          <ListSlot list={detail.expand.upsell} unit="interactions pitched this" />
        </div>
        <div className="ip-subpanel">
          <h3>Hierarchy</h3>
          <ListSlot list={detail.expand.crossSellHierarchy} unit="cross-sell hierarchy values" />
          <ListSlot list={detail.expand.upsellHierarchy} unit="upsell hierarchy values" />
          <p className="ip-note">
            Kept separate from the pitches above. The record does not link a hierarchy value to a
            specific pitch, so pairing them here would assert something nobody stored.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ip-subgrid">
      <div className="ip-subpanel">
        <h3>Commitment signals</h3>
        <ListSlot list={detail.commitment} unit="interactions gave this signal" />
      </div>
      <div className="ip-subpanel">
        <h3>Close attempts</h3>
        <ListSlot list={detail.closes} unit="interactions attempted this close" />
        <p className="ip-note">
          Close after commitment is judged on order, not presence: a close recorded before the
          customer signalled anything does not count as following it.
        </p>
      </div>
      <div className="ip-subpanel">
        <h3>Next action</h3>
        <ListSlot list={detail.nextAction} unit="interactions captured this step" />
      </div>
    </div>
  );
}

/**
 * Two rates for one behaviour, on a shared scale.
 *
 * A dumbbell rather than four columns of numbers: the distance between the dots
 * is the comparison, and reading a gap is faster and less error-prone than
 * subtracting two percentages in your head. Both ends are labelled, so the chart
 * is legible without colour.
 *
 * Only ever rendered on a sample that already cleared the guardrail — the
 * suppressed case returns before this is reached, because a persuasive shape
 * drawn on one sale and eight no-sales is worse than a table of the same
 * numbers.
 */
function Dumbbell({ rows }: { rows: OutcomeAssociationResult["rows"] }) {
  const comparable = rows.filter((row) => row.strength !== "suppressed");
  const suppressed = rows.filter((row) => row.strength === "suppressed");

  return (
    <>
      <div className="ip-dumb">
        {comparable.map((row) => {
          const sale = (row.saleRate ?? 0) * 100;
          const noSale = (row.noSaleRate ?? 0) * 100;
          return (
            <div className="ip-drow" key={row.behaviourKey}>
              <span>
                {row.label}
                {row.strength === "directional" ? <em className="ip-badge">Directional</em> : null}
              </span>
              <span
                className="ip-dline"
                style={
                  {
                    "--a": `${Math.min(sale, noSale)}%`,
                    "--b": `${Math.max(sale, noSale)}%`,
                  } as React.CSSProperties
                }
                role="img"
                aria-label={`${row.label}: ${row.saleAffected} of ${row.saleN} sales, ${row.noSaleAffected} of ${row.noSaleN} non-sales`}
              >
                <i style={{ left: `${noSale}%` }} />
                <b style={{ left: `${sale}%` }} />
              </span>
              {/* Each behaviour carries its own denominator on each side. One
                  shared "sales N" would count a demo that never applied as a
                  demo somebody skipped. */}
              <span className="ip-meta">
                {row.saleAffected}/{row.saleN} · {row.noSaleAffected}/{row.noSaleN}
              </span>
            </div>
          );
        })}
      </div>
      {suppressed.length > 0 ? (
        <p className="ip-note">
          Suppressed for too few eligible interactions on one side:{" "}
          {suppressed.map((row) => `${row.label} (${row.saleN} vs ${row.noSaleN})`).join(", ")}. At
          least {DEFAULT_GUARDRAILS.minimumForComparison} on each side are needed before a behaviour
          can be compared.
        </p>
      ) : null}
    </>
  );
}

export function FrontlineIntelligenceView({
  metrics,
  previousMetrics,
  actions,
  actionHref,
  stage,
  stageHref,
  detail,
  associations,
  analysed,
  withoutMetrics,
}: {
  metrics: FrontlineMetrics;
  previousMetrics: FrontlineMetrics | null;
  actions: (ActionCohort | null)[];
  actionHref: (cohortKey: string) => string;
  stage: StageKey;
  stageHref: (key: StageKey) => string;
  detail: FrontlineDetail;
  associations: OutcomeAssociationResult;
  analysed: number;
  /** Null where a category is selected and the count cannot be stated honestly. */
  withoutMetrics: number | null;
}) {
  const before = (key: keyof FrontlineMetrics) => previousMetrics?.[key] ?? null;
  const stageLabel = STAGES.find((item) => item.key === stage)!.label;

  return (
    <div className="ip-grid12">
      <section className="ip-front-actions ip-col-12" aria-label="Priority reviews">
        {actions.map((cohort, index) => {
          if (!cohort) {
            return (
              <div className="ip-action-card ip-action-card--empty" key={`empty-${index}`}>
                <span className="ip-meta">No additional priority review in this scope</span>
              </div>
            );
          }
          const affected = cohort.conversationIds.length;
          return (
            <TelemetryLink
              className="ip-action-card ip-tip"
              key={cohort.key}
              href={actionHref(cohort.key)}
              data-tip={`${actionLabel(cohort.key)} · ${affected}${cohort.measurable ? ` of ${cohort.measurable}` : ""} · ${cohort.reason}`}
              telemetry={{
                event: "priority_action_opened",
                objectType: "action",
                objectKey: cohort.key,
                cohortKey: cohort.key,
              }}
            >
              <strong>{affected}</strong>
              <span>{actionLabel(cohort.key)}</span>
              <span className="ip-meta">
                {cohort.measurable && cohort.measurable > 0
                  ? `of ${cohort.measurable} measurable`
                  : "interactions"}
              </span>
            </TelemetryLink>
          );
        })}
      </section>

      {/* The stage cards and the one detail panel are a single local
          selection: nothing about the population changes, so nothing should
          wait on the server. */}
      <LocalSwitch param="stage" initial={stage}>
        <section className="ip-execution ip-col-12" aria-label="Execution">
          {STAGES.map((item) => (
            <TelemetryLink
              className={`ip-stage${item.key === stage ? " ip-stage--active" : ""}`}
              key={item.key}
              href={stageHref(item.key)}
              aria-current={item.key === stage ? "true" : undefined}
              data-local-key={item.key}
              telemetry={{
                event: "frontline_stage_selected",
                objectType: "stage",
                objectKey: item.key,
              }}
            >
              <h3>{item.label}</h3>
              <dl>
                {STAGE_SUMMARY[item.key].map((metricKey) => {
                  const m = metrics[metricKey];
                  const definition = metric(METRIC_KEYS[metricKey]);
                  return (
                    <div className="ip-row" key={metricKey}>
                      <dt>{definition.label}</dt>
                      <dd>
                        {m.value === null ? "—" : formatPercent(m.value)}
                        <span className="ip-meta">
                          {" "}
                          {m.affected ?? 0}/{m.observed}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </TelemetryLink>
          ))}
        </section>

        <section className="ip-panel ip-col-12" aria-labelledby="fl-detail">
          <div className="ip-section-title">
            <h2 id="fl-detail">Detail</h2>
          </div>
          {analysed === 0 ? (
            <DataState state="NO_OBSERVATIONS" />
          ) : (
            STAGES.map((item) => (
              <div data-local-panel={item.key} hidden={item.key !== stage} key={item.key}>
                <StageDetail
                  stage={item.key}
                  metrics={metrics}
                  previous={previousMetrics}
                  detail={detail}
                />
              </div>
            ))
          )}
        </section>
      </LocalSwitch>

      <QuadrantBenchmark />

      <section className="ip-panel ip-col-12" aria-labelledby="fl-behaviour">
        <details>
          <summary className="ip-section-title">
            <h2 id="fl-behaviour">Behavior &amp; outcome</h2>
            <span className="ip-meta">
              {associations.saleTotal} confirmed sales · {associations.noSaleTotal} confirmed
              no-sales
            </span>
          </summary>
          {associations.rows.every((row) => row.strength === "suppressed") ? (
            <div className="ip-state" role="status">
              <strong>Too few established outcomes to compare</strong>
              <span>
                Every behaviour has fewer than {DEFAULT_GUARDRAILS.minimumForComparison} eligible
                interactions on one side. Interactions whose outcome was never settled belong to
                neither group and are never filed as no-sales.
              </span>
            </div>
          ) : (
            <>
              <p className="ip-legend">
                <b className="ip-swatch ip-seg--teal" aria-hidden="true" /> in sales{" "}
                <b className="ip-swatch ip-seg--coral" aria-hidden="true" /> in non-sales · each
                behaviour on its own denominator
              </p>
              <Dumbbell rows={associations.rows} />
              <p className="ip-note">
                These conversations were recorded, not controlled. A behaviour being more common in
                sales does not mean it caused them.
              </p>
            </>
          )}
        </details>
      </section>

      {withoutMetrics !== null && withoutMetrics > 0 ? (
        <p className="ip-note ip-col-12">
          {withoutMetrics} conversation{withoutMetrics === 1 ? "" : "s"} in this period could not be
          included because analysis has not finished for them.
        </p>
      ) : null}
    </div>
  );
}
