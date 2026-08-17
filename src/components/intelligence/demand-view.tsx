import {
  CLARITY_LABELS,
  type BudgetPicture,
  type ClarityMatrix,
  type DemandMetrics,
  type RankedShare,
} from "@/modules/intelligence/demand";
import { change, DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";
import { metric } from "@/modules/intelligence/metric-registry";

/**
 * Who walked in, what they wanted, and what stopped them.
 *
 * Ranked bars throughout rather than a variety of chart types. Length from a
 * common baseline is the comparison people read most accurately, and using one
 * grammar repeatedly means a reader learns the page once instead of decoding
 * each panel. Nothing here is a pie.
 *
 * Free-text fields are shown as they were spoken and labelled as such. Merging
 * "battery life" with "Battery Life" would look tidier and would be a taxonomy
 * the business never agreed to.
 */

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function money(minor: number | null, currency: string | null): string {
  if (minor === null) return "—";
  const major = minor / 100;
  const symbol = currency === "INR" ? "₹" : currency ? `${currency} ` : "";
  if (major >= 100000) return `${symbol}${(major / 100000).toFixed(1).replace(/\.0$/, "")} lakh`;
  if (major >= 1000) return `${symbol}${Math.round(major / 1000)}K`;
  return `${symbol}${Math.round(major)}`;
}

function Sample({ measure: m }: { measure: Measure }) {
  if (m.value === null) return <p className="fl-sample">Not measured in this period</p>;
  const thin = m.observed < DEFAULT_GUARDRAILS.minimumForConfidentDisplay;
  return (
    <p className={`fl-sample${thin ? " fl-sample--thin" : ""}`}>
      {m.affected ?? 0} of {m.observed}
      {thin ? " · directional only" : ""}
    </p>
  );
}

function Kpi({
  metricKey,
  measure: m,
  previous,
}: {
  metricKey: string;
  measure: Measure;
  previous?: Measure | null;
}) {
  const definition = metric(metricKey);
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
        <Sample measure={m} />
      </dd>
    </div>
  );
}

/**
 * Turns a stored enum into something a person reads.
 *
 * Applied only to controlled vocabularies. Free-text values are already prose
 * and rewriting them would misrepresent what was said.
 */
function readable(token: string): string {
  const spaced = token.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A ranked bar list. The only comparison shape on this page. */
function Ranked({
  title,
  note,
  entries,
  eligible,
  unit,
  controlled,
}: {
  title: string;
  note?: string;
  entries: RankedShare[];
  eligible: number;
  unit: string;
  /** Whether the values come from a fixed vocabulary and may be relabelled. */
  controlled?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div className="dm-panel">
        <h3>{title}</h3>
        <p className="fl-none">Nothing recorded in this period.</p>
      </div>
    );
  }
  const widest = entries[0]!.interactions || 1;
  return (
    <div className="dm-panel">
      <h3>{title}</h3>
      <ul className="dm-bars">
        {entries.map((entry) => (
          <li key={`${entry.label ?? ""}-${entry.value}`}>
            <span className="dm-bar-label">
              {entry.label ? <em>{entry.label.replaceAll("_", " ")}</em> : null}
              {controlled ? readable(entry.value) : entry.value}
            </span>
            <span className="dm-bar-track" aria-hidden="true">
              <span
                className="dm-bar-fill"
                style={{ width: `${Math.max(2, (entry.interactions / widest) * 100)}%` }}
              />
            </span>
            <span className="dm-bar-value">
              {entry.interactions} · {percent(entry.share)}
            </span>
          </li>
        ))}
      </ul>
      <p className="fl-sample">
        of {eligible} {unit}
      </p>
      {note ? <p className="fl-note">{note}</p> : null}
    </div>
  );
}

function ClarityGrid({ matrix }: { matrix: ClarityMatrix }) {
  if (matrix.paired === 0) {
    return <p className="fl-none">No interaction had both an opening and a closing clarity.</p>;
  }
  const busiest = Math.max(...matrix.cells.flat(), 1);
  return (
    <table className="dm-matrix">
      <caption className="fl-sample">
        Rows: clarity on arrival. Columns: clarity at the close. {matrix.paired} interactions.
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="dm-matrix-corner">arrival ↓ / close →</span>
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
                key={end}
                // Weight, not hue. A single ink at varying strength keeps the
                // reading ordinal and survives being printed or colour-blind.
                style={{
                  background: count
                    ? `rgba(20,20,19,${0.06 + (count / busiest) * 0.5})`
                    : undefined,
                }}
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
  clarity,
  categories,
  intents,
  useCases,
  requirements,
  drivers,
  brands,
  questions,
  blockers,
  conditions,
  periodLabel,
}: {
  metrics: DemandMetrics;
  previous: DemandMetrics | null;
  budget: BudgetPicture;
  clarity: ClarityMatrix;
  categories: { entries: RankedShare[]; classified: number };
  intents: { entries: RankedShare[]; classified: number };
  useCases: { entries: RankedShare[]; eligible: number };
  requirements: { entries: RankedShare[]; eligible: number };
  drivers: { entries: RankedShare[]; eligible: number };
  brands: { entries: RankedShare[]; eligible: number };
  questions: { entries: RankedShare[]; eligible: number };
  blockers: { entries: RankedShare[]; classified: number };
  conditions: { entries: RankedShare[]; eligible: number };
  periodLabel: string;
}) {
  if (metrics.analysed === 0) {
    return (
      <section className="fl-empty">
        <p>No analysed interactions in {periodLabel}.</p>
        <p className="fl-empty-note">
          Conversations appear here once they have been transcribed, speaker-mapped and analysed.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="fl-section" aria-labelledby="dm-pulse">
        <h2 id="dm-pulse">Who walked in</h2>
        <dl className="fl-rates">
          <Kpi
            metricKey="high_intent_arrival"
            measure={metrics.highIntent}
            previous={previous?.highIntent}
          />
          <Kpi
            metricKey="finance_demand"
            measure={metrics.financeDemand}
            previous={previous?.financeDemand}
          />
          <Kpi
            metricKey="competitor_pressure"
            measure={metrics.competitorPressure}
            previous={previous?.competitorPressure}
          />
        </dl>
      </section>

      <section className="fl-section" aria-labelledby="dm-wanted">
        <h2 id="dm-wanted">What they came for</h2>
        <div className="dm-grid">
          <Ranked
            title="Category"
            controlled
            entries={categories.entries}
            eligible={categories.classified}
            unit="interactions with a category"
          />
          <Ranked
            title="How decided they were on arrival"
            controlled
            entries={intents.entries}
            eligible={intents.classified}
            unit="interactions with a readable intent"
          />
        </div>
        <div className="dm-grid">
          <Ranked
            title="What they wanted it for"
            entries={useCases.entries}
            eligible={useCases.eligible}
            unit="interactions asked"
            note="One customer can want several things, so these add to more than 100%. Shown as spoken — near-identical wordings are not merged, because doing so would invent a taxonomy nobody agreed to."
          />
          <Ranked
            title="Brands they named a preference for"
            entries={brands.entries}
            eligible={brands.eligible}
            unit="interactions asked"
          />
        </div>
      </section>

      <section className="fl-section" aria-labelledby="dm-matters">
        <h2 id="dm-matters">What mattered in the decision</h2>
        <div className="dm-grid">
          <Ranked
            title="Requirements"
            entries={requirements.entries}
            eligible={requirements.eligible}
            unit="interactions asked"
          />
          <Ranked
            title="Decision drivers"
            entries={drivers.entries}
            eligible={drivers.eligible}
            unit="interactions asked"
            note="Free text, shown as spoken."
          />
        </div>
      </section>

      <section className="fl-section" aria-labelledby="dm-spend">
        <h2 id="dm-spend">What they were willing to spend</h2>
        <dl className="fl-rates">
          <div className="fl-rate">
            <dt>Median stated budget</dt>
            <dd>
              <strong>{money(budget.targetMedian, budget.currency)}</strong>
              <p className="fl-sample">stated in {budget.targetObserved} interactions</p>
            </dd>
          </div>
          <div className="fl-rate">
            <dt>Median ceiling</dt>
            <dd>
              <strong>{money(budget.maximumMedian, budget.currency)}</strong>
              <p className="fl-sample">stated in {budget.maximumObserved} interactions</p>
            </dd>
          </div>
          <div className="fl-rate">
            <dt>Room above the opening budget</dt>
            <dd>
              <strong>{money(budget.stretchMedian, budget.currency)}</strong>
              <p className="fl-sample">both figures in {budget.stretchObserved} interactions</p>
            </dd>
          </div>
        </dl>
        <p className="fl-note">
          Medians of what customers actually said. An interaction where no budget came up is left
          out rather than counted as zero, which is why the counts differ from the total.
        </p>
      </section>

      <section className="fl-section" aria-labelledby="dm-clarity">
        <h2 id="dm-clarity">Did the conversation help them work out what they needed?</h2>
        <dl className="fl-rates">
          <Kpi metricKey="clarity_improved" measure={clarity.improved} previous={null} />
          <div className="fl-rate">
            <dt>Arrived unclear and left unclear</dt>
            <dd>
              <strong>{clarity.stalledLow}</strong>
              <p className="fl-sample">of {clarity.paired} with both states</p>
            </dd>
          </div>
        </dl>
        <ClarityGrid matrix={clarity} />
      </section>

      <section className="fl-section" aria-labelledby="dm-stuck">
        <h2 id="dm-stuck">What stopped progress</h2>
        <div className="dm-grid">
          <Ranked
            title="Strongest evidenced blocker"
            controlled
            entries={blockers.entries}
            eligible={blockers.classified}
            unit="unresolved interactions with a reason"
          />
          <Ranked
            title="What customers said would close it"
            entries={conditions.entries}
            eligible={conditions.eligible}
            unit="unresolved interactions asked"
            note="What the customer explicitly stated, not our guess at what would have worked. Free text: the same condition phrased four ways counts as four here, because merging them would be us deciding they meant the same thing."
          />
        </div>
      </section>

      <section className="fl-section" aria-labelledby="dm-asking">
        <h2 id="dm-asking">What they were asking about</h2>
        <Ranked
          title="Question topics"
          entries={questions.entries}
          eligible={questions.eligible}
          unit="interactions asked"
        />
      </section>
    </>
  );
}
