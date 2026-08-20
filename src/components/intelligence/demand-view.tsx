import { LocalSwitch } from "@/components/intelligence/local-switch";

import { DataState, stateFor, type SlotState } from "@/components/intelligence/data-state";
import { observedCohortKey, valueCohortKey } from "@/modules/intelligence/cohorts";
import { RankedBars } from "@/components/intelligence/interactive-ranked-bar";
import { Delta, formatMoney, formatPercent, tipText } from "@/components/intelligence/metric-tile";
import { SectionTabs, type Tab } from "@/components/intelligence/section-tabs";
import { TelemetryLink } from "@/components/intelligence/telemetry";
import { SegmentedBar, type Segment } from "@/components/intelligence/segmented-bar";
import {
  CLARITY_LABELS,
  type BudgetPicture,
  type ClarityMatrix,
  type ContextPrices,
  type DemandMetrics,
  type NoSaleReasons,
  type RankedShare,
} from "@/modules/intelligence/demand";
import type { Measure } from "@/modules/intelligence/guardrails";

/**
 * Demand — what customers came in wanting, in their own words.
 *
 * Customer-side only. What the representative did about any of it belongs to
 * Frontline; keeping the two apart is what lets a manager see that finance
 * demand rose without that fact immediately becoming an accusation about the
 * floor staff.
 *
 * Free-text fields are shown as they were spoken. Merging "battery life" with
 * "Battery Life" would look tidier and would be a taxonomy the business never
 * agreed to — and the number underneath would quietly change meaning.
 */

export const NEED_TABS: readonly Tab[] = [
  { key: "initial_request", label: "Initial request" },
  { key: "use_cases", label: "Use cases" },
  { key: "requirements", label: "Requirements" },
  { key: "drivers", label: "Decision drivers" },
  { key: "brands", label: "Brands" },
];

export type NeedTabKey = (typeof NEED_TABS)[number]["key"];

export const VOICE_TABS: readonly Tab[] = [
  { key: "context", label: "Context" },
  { key: "competitors", label: "Competitors" },
  { key: "stock", label: "Stock & offers" },
  { key: "questions", label: "Questions" },
  { key: "objections", label: "Objections" },
  { key: "conditions", label: "Conditions" },
];

export type RankedList = { entries: RankedShare[]; eligible: number };
export type Distribution = { entries: RankedShare[]; classified: number };

/** One list inside the Context & voice section; several share a tab. */
export type VoicePanel = {
  key: string;
  title: string;
  list: RankedList | Distribution;
  unit: string;
  controlled: boolean;
  /** The field a value's evidence is read from, where one applies. */
  fieldKey?: string;
  /**
   * Overrides how a value becomes a cohort, for panels whose values are derived
   * rather than recorded — a party-size bucket is not a stored value, so
   * matching on the text would open the wrong interactions.
   */
  cohortKeyFor?: (value: string) => string;
};

/** Which field each Needs tab reads first, for the evidence link. */
export const NEED_FIELD_KEYS: Readonly<Record<string, string[]>> = {
  initial_request: ["initial_request"],
  use_cases: ["purchase_use_cases"],
  requirements: ["specification_requirements", "additional_requirements", "other_constraints"],
  drivers: ["decision_drivers"],
  brands: ["brand_preferences"],
};

/** The four fixed arrival intents, in the order a customer moves through them. */
const INTENT_ORDER: readonly { value: string; label: string; tone: Segment["tone"] }[] = [
  { value: "exploratory", label: "Exploratory", tone: "slate" },
  { value: "comparing", label: "Comparing", tone: "amber" },
  { value: "specific_product", label: "Specific product", tone: "indigo" },
  { value: "ready_to_buy", label: "Ready to buy", tone: "teal" },
];

function Figure({
  label,
  value,
  measure: m = null,
  previous = null,
  meta,
}: {
  label: string;
  value: string;
  measure?: Measure | null;
  previous?: Measure | null;
  meta?: string;
}) {
  return (
    <div
      className="ip-pitem ip-tip"
      tabIndex={0}
      data-tip={tipText({ label, value, measure: m, previous })}
    >
      <span className="ip-label">{label}</span>
      <strong>{value}</strong>
      {m ? <Delta measure={m} previous={previous} /> : null}
      <span className="ip-meta">{meta ?? (m ? `${m.affected ?? 0} of ${m.observed}` : "—")}</span>
    </div>
  );
}

/** A ranked list inside a tab, with its own data state. */
function ListPanel({
  list,
  unit,
  controlled,
  limit,
  expandHref,
  hrefFor,
  evidenceHrefFor,
}: {
  list: RankedList | Distribution;
  unit: string;
  controlled?: boolean;
  limit?: number;
  expandHref?: string | null;
  hrefFor?: (value: string, fieldKey: string) => string;
  /** A separate small affordance, so one click never does two jobs. */
  evidenceHrefFor?: (value: string, fieldKey: string) => string;
}) {
  const eligible = "eligible" in list ? list.eligible : list.classified;
  const state: SlotState =
    eligible === 0 ? "NOT_SUPPORTED" : list.entries.length === 0 ? "NO_OBSERVATIONS" : "POPULATED";
  if (state !== "POPULATED") return <DataState state={state} />;
  return (
    <RankedBars
      entries={list.entries}
      distinct={"distinct" in list ? (list.distinct as number) : undefined}
      eligible={eligible}
      unit={unit}
      controlled={controlled}
      limit={limit}
      expandHref={expandHref}
      hrefFor={hrefFor}
      evidenceHrefFor={evidenceHrefFor}
      evidenceEvent="demand_value_reviewed"
    />
  );
}

function ClarityGrid({ matrix }: { matrix: ClarityMatrix }) {
  if (matrix.paired === 0) return <DataState state="NO_OBSERVATIONS" />;
  const busiest = Math.max(...matrix.cells.flat(), 1);
  // One sequential family, not four hues. The reading is ordinal — more or
  // fewer interactions — and a rainbow would invent categories.
  const step = (count: number) =>
    count === 0 ? "" : ` ip-h${Math.min(4, Math.ceil((count / busiest) * 4))}`;
  return (
    <table className="ip-matrix">
      <caption className="ip-note">
        Rows: clarity on arrival. Columns: clarity at the close. {matrix.paired} interactions with
        both.
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="ip-visually-hidden">Clarity on arrival</span>
            <span aria-hidden="true">↓ arrival</span>
          </th>
          {CLARITY_LABELS.map((label) => (
            <th key={label} scope="col">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.cells.map((rowCells, start) => (
          <tr key={CLARITY_LABELS[start]}>
            <th scope="row">{CLARITY_LABELS[start]}</th>
            {rowCells.map((count, end) => (
              <td
                className={`ip-mcell${step(count)} ip-tip`}
                key={end}
                tabIndex={0}
                data-tip={`Arrived ${CLARITY_LABELS[start]} · closed ${CLARITY_LABELS[end]} · ${count} of ${matrix.paired}`}
              >
                {count || ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DemandView({
  metrics,
  previous,
  budget,
  prices,
  clarity,
  origins,
  categories,
  intents,
  needs,
  need,
  needHref,
  expandHref,
  voice,
  voiceTab,
  voiceHref,
  blockers,
  categoryHref,
  categoryExpandHref,
  intentHref,
  evidenceHref,
}: {
  metrics: DemandMetrics;
  previous: DemandMetrics | null;
  budget: BudgetPicture;
  prices: ContextPrices;
  clarity: ClarityMatrix;
  origins: RankedList;
  categories: Distribution;
  intents: Distribution;
  /** Every Needs panel, so switching tabs never waits on the server. */
  needs: Record<string, RankedList>;
  need: string;
  needHref: (key: string) => string;
  expandHref: string | null;
  /** Every Context & voice panel set, keyed by tab. */
  voice: Record<string, VoicePanel[]>;
  voiceTab: string;
  voiceHref: (key: string) => string;
  blockers: NoSaleReasons;
  categoryHref: (value: string) => string;
  /** Reveals every category, or null when they are all already shown. */
  categoryExpandHref: string | null;
  intentHref: (value: string) => string;
  /** Opens the evidence behind one observed value of one field. */
  /** Opens a named cohort in the evidence drawer. */
  evidenceHref: (cohortKey: string) => string;
}) {
  // One currency or none: a median is a number. More than one and it is not.
  const lead = budget.byCurrency.length === 1 ? budget.byCurrency[0] : null;
  const intentSegments: Segment[] = INTENT_ORDER.map((intent) => ({
    key: intent.value,
    label: intent.label,
    tone: intent.tone,
    count: intents.entries.find((entry) => entry.value === intent.value)?.interactions ?? 0,
    href: intentHref(intent.value),
  }));
  const intentState: SlotState = intents.classified === 0 ? "NO_OBSERVATIONS" : "POPULATED";
  const blockerState: SlotState =
    blockers.confirmedNoSales === 0
      ? "NO_OBSERVATIONS"
      : blockers.classified === 0
        ? "NOT_SUPPORTED"
        : "POPULATED";

  return (
    <div className="ip-grid12">
      <section className="ip-panel ip-snapshot ip-col-12" aria-label="Snapshot">
        <Figure
          label="Analysed interactions"
          value={String(metrics.analysed)}
          meta="in the selected scope"
        />
        <Figure
          label="Median target budget"
          value={
            budget.mixed
              ? "Multiple currencies"
              : formatMoney(lead?.targetMedian ?? null, lead?.currency ?? null)
          }
          meta={
            budget.mixed
              ? `${budget.byCurrency.length} currencies in this scope`
              : `stated in ${lead?.targetObserved ?? 0} interaction${(lead?.targetObserved ?? 0) === 1 ? "" : "s"}`
          }
        />
        <Figure
          label="Finance demand"
          value={formatPercent(metrics.financeDemand.value)}
          measure={metrics.financeDemand}
          previous={previous?.financeDemand ?? null}
        />
        <Figure
          label="Competitor mentions"
          value={formatPercent(metrics.competitorPressure.value)}
          measure={metrics.competitorPressure}
          previous={previous?.competitorPressure ?? null}
        />
      </section>

      <section className="ip-panel ip-col-7" aria-labelledby="dm-mix">
        <div className="ip-section-title">
          <h2 id="dm-mix">Demand mix</h2>
          <span className="ip-meta">Bar filters · Review opens evidence</span>
        </div>
        <ListPanel
          list={categories}
          controlled
          unit={`of ${categories.classified} interactions with a category`}
          limit={categoryExpandHref === null ? undefined : 8}
          expandHref={categoryExpandHref}
          hrefFor={categoryHref}
          evidenceHrefFor={(item: string, fieldKey: string) =>
            evidenceHref(valueCohortKey(fieldKey, item))
          }
        />
      </section>

      <section className="ip-panel ip-col-5" aria-labelledby="dm-intent">
        <div className="ip-section-title">
          <h2 id="dm-intent">Arrival intent</h2>
          <span className="ip-meta">Click a segment to filter</span>
        </div>
        {intentState === "POPULATED" ? (
          <SegmentedBar segments={intentSegments} unit="interactions with a readable intent" />
        ) : (
          <DataState state={intentState} />
        )}
      </section>

      <section className="ip-panel ip-col-12" aria-labelledby="dm-needs">
        <LocalSwitch param="need" initial={need}>
          <div className="ip-section-title">
            <h2 id="dm-needs">Needs</h2>
            <SectionTabs tabs={NEED_TABS} active={need} hrefFor={needHref} label="Need" />
          </div>
          {NEED_TABS.map((tab) => (
            <div data-local-panel={tab.key} hidden={tab.key !== need} key={tab.key}>
              <ListPanel
                list={needs[tab.key]!}
                unit={`of ${needs[tab.key]!.eligible} interactions carried this field`}
                limit={5}
                expandHref={expandHref}
                // The field the value actually came from. Requirements reads
                // three fields, and opening the first of them for a value
                // recorded in the third showed quotes the number did not count.
                evidenceHrefFor={(item: string, fieldKey: string) =>
                  evidenceHref(valueCohortKey(fieldKey, item))
                }
              />
            </div>
          ))}
          <p className="ip-note">
            Shown as spoken, never merged. One customer can want several things, so these exceed
            100% — penetration, not a mix.
          </p>
        </LocalSwitch>
      </section>

      <section className="ip-panel ip-col-6" aria-labelledby="dm-budget">
        <div className="ip-section-title">
          <h2 id="dm-budget">Budget</h2>
          {budget.mixed ? <span className="ip-meta">Multiple currencies in this scope</span> : null}
        </div>
        {budget.byCurrency.length === 0 ? (
          <DataState state="NO_OBSERVATIONS" />
        ) : (
          budget.byCurrency.map((line) => (
            <div key={line.currency ?? "none"}>
              {budget.mixed ? (
                <h3 className="ip-currency-head">{line.currency ?? "Unstated currency"}</h3>
              ) : null}
              <div className="ip-figure-row">
                <Figure
                  label="Median target"
                  value={formatMoney(line.targetMedian, line.currency)}
                  meta={`${line.targetObserved} stated`}
                />
                <Figure
                  label="Median maximum"
                  value={formatMoney(line.maximumMedian, line.currency)}
                  meta={`${line.maximumObserved} stated`}
                />
                <Figure
                  label="Paired median stretch"
                  value={formatMoney(line.stretchMedian, line.currency)}
                  meta={`${line.stretchObserved} with both`}
                />
              </div>
            </div>
          ))
        )}
        <div className="ip-figure-row">
          <Figure
            label="Budget coverage"
            value={formatPercent(budget.observationRate.value)}
            measure={budget.observationRate}
          />
        </div>
        <div className="ip-subgrid">
          <div className="ip-subpanel">
            <h3>Store price quoted</h3>
            {prices.storeQuoted.length === 0 ? (
              <DataState state="NO_OBSERVATIONS" compact />
            ) : (
              prices.storeQuoted.map((line) => (
                <Figure
                  key={line.currency ?? "none"}
                  label={line.currency ?? "Unstated currency"}
                  value={formatMoney(line.median, line.currency)}
                  meta={`median of ${line.observed} quoted`}
                />
              ))
            )}
          </div>
          <div className="ip-subpanel">
            <h3>Customer-stated competitor price</h3>
            {prices.competitorClaim.length === 0 ? (
              <DataState state="NO_OBSERVATIONS" compact />
            ) : (
              <>
                {prices.competitorClaim.map((line) => (
                  <Figure
                    key={line.currency ?? "none"}
                    label={line.currency ?? "Unstated currency"}
                    value={formatMoney(line.median, line.currency)}
                    meta={`median of ${line.observed} claim${line.observed === 1 ? "" : "s"}`}
                  />
                ))}
                {/* The qualification travels with the number, not only in the
                    note under the section. Somebody reading one figure has to
                    see what it is. */}
                <p className="ip-note">Customer-stated; unverified</p>
                <TelemetryLink
                  className="ip-review"
                  href={evidenceHref(observedCohortKey("competitor_price_claim"))}
                  telemetry={{
                    event: "demand_value_reviewed",
                    objectType: "competitor_price_claim",
                    objectKey: "observed",
                  }}
                >
                  Review
                </TelemetryLink>
              </>
            )}
          </div>
        </div>
        <p className="ip-note">
          Medians of what was said; an interaction with no budget is left out, not counted as zero.
          Currencies are never combined and nothing is converted. The competitor figure is
          customer-stated and unverified.
        </p>
      </section>

      <section className="ip-panel ip-col-6" aria-labelledby="dm-clarity">
        <div className="ip-section-title">
          <h2 id="dm-clarity">Clarity</h2>
          <span className="ip-meta">
            Improved {formatPercent(clarity.improved.value)} · {clarity.improved.affected ?? 0} of{" "}
            {clarity.improved.observed}
          </span>
        </div>
        <ClarityGrid matrix={clarity} />
        {origins.eligible > 0 ? (
          <SegmentedBar
            segments={origins.entries.map((entry, index) => ({
              key: entry.value,
              label: entry.value.charAt(0).toUpperCase() + entry.value.slice(1),
              count: entry.interactions,
              tone: (["teal", "indigo", "slate"] as const)[index] ?? "slate",
            }))}
            unit="requirement origins observed"
          />
        ) : (
          <DataState state="NOT_SUPPORTED" compact />
        )}
      </section>

      <section className="ip-panel ip-col-12" aria-labelledby="dm-voice">
        <LocalSwitch param="voice" initial={voiceTab}>
          <div className="ip-section-title">
            <h2 id="dm-voice">Context &amp; voice</h2>
            <SectionTabs
              tabs={VOICE_TABS}
              active={voiceTab}
              hrefFor={voiceHref}
              label="Context and voice"
            />
          </div>
          {VOICE_TABS.map((tab) => (
            <div data-local-panel={tab.key} hidden={tab.key !== voiceTab} key={tab.key}>
              <div className="ip-subgrid">
                {(voice[tab.key] ?? []).map((panel) => (
                  <div className="ip-subpanel" key={panel.key}>
                    <h3>{panel.title}</h3>
                    <ListPanel
                      list={panel.list}
                      unit={panel.unit}
                      controlled={panel.controlled}
                      limit={6}
                      evidenceHrefFor={
                        panel.cohortKeyFor
                          ? (item: string) => evidenceHref(panel.cohortKeyFor!(item))
                          : panel.fieldKey
                            ? (item: string, fieldKey: string) =>
                                evidenceHref(valueCohortKey(fieldKey, item))
                            : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </LocalSwitch>
      </section>

      <section className="ip-panel ip-col-12" aria-labelledby="dm-blockers">
        <div className="ip-section-title">
          <h2 id="dm-blockers">No-sale blockers</h2>
          <span className="ip-meta">
            {blockers.confirmedNoSales} confirmed no-sales · {blockers.classified} with a reason ·{" "}
            {formatPercent(blockers.coverage.value)} coverage
          </span>
        </div>
        {blockerState === "POPULATED" ? (
          <RankedBars
            entries={blockers.entries}
            distinct={blockers.distinct}
            eligible={blockers.classified}
            controlled
            unit={`of ${blockers.classified} confirmed no-sales carrying an observed reason`}
            evidenceHrefFor={(item: string, fieldKey: string) =>
              evidenceHref(valueCohortKey(fieldKey, item))
            }
            evidenceEvent="demand_value_reviewed"
          />
        ) : (
          <DataState state={blockerState} />
        )}
        <p className="ip-note">
          Confirmed no-sales only — a reason cannot be read from a result we never established.
          Observed and classified, never a proven cause.
        </p>
      </section>
    </div>
  );
}
