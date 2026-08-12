import type {
  Band,
  CategoryCoverage,
  DemandIntelligence,
  Distribution,
  LabeledDimension,
  ShadowPrice,
} from "@/modules/interaction-metrics/aggregate";
import type { DemandLeakage } from "@/modules/interaction-metrics/leakage";
import type { DecisionFilter } from "@/modules/interaction-metrics/decision-hierarchy";
import type { BehaviourMix } from "@/modules/interaction-metrics/buying-behaviour";

/**
 * The demand intelligence dashboard, read as the category head's own question
 * chain: what customers wanted, whether we understood them, who we were up
 * against, where demand leaked, and how well we sold.
 *
 * Every figure is a deterministic count or average of stored, evidence-backed
 * facts — no model produced any number here. Where a value rests on a
 * customer's unverified claim, the panel says so.
 */

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function rupees(minor: number | null, currency: string | null): string {
  if (minor === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency ?? "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function Bars({
  items,
  total,
  empty = "Not mentioned yet.",
}: {
  items: (Distribution | Band)[];
  total: number;
  empty?: string;
}) {
  if (items.length === 0) return <p className="demand-empty">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="demand-bars">
      {items.slice(0, 8).map((item) => (
        <li key={item.key}>
          <span className="demand-bar-label" title={item.key}>
            {item.key}
          </span>
          <span className="demand-bar-track">
            <span className="demand-bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <span className="demand-bar-count">
            {item.count}
            <span className="demand-bar-share"> · {Math.round((item.count / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="demand-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Section({
  label,
  title,
  wide = false,
  children,
}: {
  label: string;
  title: string;
  /** Full width, for content that reads as one figure rather than panels. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="demand-block">
      <div className="demand-block-head">
        <p className="eyebrow">{label}</p>
        <h2>{title}</h2>
      </div>
      {wide ? children : <div className="demand-columns">{children}</div>}
    </section>
  );
}

/**
 * The demand leakage funnel.
 *
 * Each stage shows how much demand survived it and, beneath, what was lost
 * there. A stage the conversation cannot answer — whether the range holds a
 * suitable product — says so rather than showing a number nobody can defend.
 */
function Funnel({ leakage }: { leakage: DemandLeakage }) {
  if (leakage.total === 0) {
    return <p className="demand-empty">No interactions in this window.</p>;
  }

  return (
    <>
      <ol className="funnel">
        {leakage.stages.map((stage) => {
          const share = (stage.reached / leakage.total) * 100;
          return (
            <li
              key={stage.key}
              className={`funnel-stage${stage.measured ? "" : " funnel-stage--unmeasured"}`}
            >
              <div className="funnel-row">
                <span className="funnel-label">
                  {stage.label}
                  {stage.basis === "claimed" ? <span className="funnel-tag">claimed</span> : null}
                  {!stage.measured ? (
                    <span className="funnel-tag funnel-tag--none">not measured</span>
                  ) : null}
                </span>
                <span className="funnel-track">
                  <span className="funnel-fill" style={{ width: `${share}%` }} />
                </span>
                <span className="funnel-count">
                  {stage.reached}
                  <span className="funnel-share"> · {Math.round(share)}%</span>
                </span>
              </div>
              {stage.leaked > 0 && stage.leakLabel ? (
                <p className="funnel-leak">
                  <span className="funnel-leak-count">−{stage.leaked}</span> {stage.leakLabel}
                </p>
              ) : null}
              {stage.note ? <p className="funnel-note">{stage.note}</p> : null}
            </li>
          );
        })}
      </ol>
      {leakage.unattributed > 0 ? (
        <p className="funnel-footnote">
          <strong>{leakage.unattributed}</strong> interaction
          {leakage.unattributed === 1 ? "" : "s"} cleared every measured stage and still did not
          convert — no single blocker was identifiable from the conversation.
        </p>
      ) : null}
    </>
  );
}

function Dimensions({ items }: { items: LabeledDimension[] }) {
  if (items.length === 0) return <p className="demand-empty">No category requirements yet.</p>;
  return (
    <ul className="demand-dimensions">
      {items.slice(0, 8).map((item) => (
        <li key={item.key}>
          <span className="demand-dim-key">{item.key.replaceAll("_", " ")}</span>
          <span className="demand-dim-count">{item.count}</span>
          {item.example ? <span className="demand-dim-eg">e.g. {item.example}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Shadow({ items }: { items: ShadowPrice[] }) {
  if (items.length === 0) return <p className="demand-empty">No competitor prices cited yet.</p>;
  return (
    <ul className="demand-shadow">
      {items.slice(0, 6).map((item) => (
        <li key={item.product}>
          <span className="demand-shadow-product" title={item.product}>
            {item.product}
          </span>
          <span className="demand-shadow-price">{rupees(item.median, item.currency)}</span>
          <span className="demand-shadow-count">×{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The order decision filters surface, earliest first.
 *
 * Stated as a proxy, not a reading of intent: a representative's questioning
 * shapes when a topic comes up as much as the customer's own priorities.
 */
function DecisionOrder({ filters }: { filters: DecisionFilter[] }) {
  if (filters.length === 0) {
    return <p className="demand-empty">Not enough evidence to order decision filters yet.</p>;
  }
  return (
    <ol className="decision-order">
      {filters.map((filter, index) => (
        <li key={filter.dimension}>
          <span className="decision-rank">{index + 1}</span>
          <span className="decision-dimension">{filter.dimension}</span>
          <span className="decision-detail">
            first in {Math.round(filter.firstShare * 100)}% · seen in {filter.conversations}{" "}
            interaction{filter.conversations === 1 ? "" : "s"}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Observed buying behaviour per category, against the role the business set.
 *
 * Categories here are ANUMA's own, reached through a confirmed mapping of what
 * the customer said. Anything that mapping does not yet cover is stated
 * underneath rather than left out, because a reader has no way of telling a
 * category that is genuinely quiet from one whose interactions never arrived.
 */
function Behaviour({ mixes, coverage }: { mixes: BehaviourMix[]; coverage: CategoryCoverage }) {
  if (mixes.length === 0) {
    return (
      <>
        <p className="demand-empty">No category behaviour observed yet.</p>
        <Coverage coverage={coverage} />
      </>
    );
  }
  return (
    <>
      <ul className="behaviour-list">
        {mixes.map((mix) => (
          <li key={mix.category} className={mix.mismatch ? "behaviour--mismatch" : undefined}>
            <div className="behaviour-head">
              <span className="behaviour-category">{mix.category}</span>
              {mix.intendedRole ? (
                <span className="behaviour-role">managed as {mix.intendedRole}</span>
              ) : (
                <span className="behaviour-role behaviour-role--unset">no role set</span>
              )}
              <span className="behaviour-observed">{mix.observed} observed</span>
            </div>
            <div className="behaviour-bars">
              {mix.counts.map((entry) => (
                <span key={entry.behaviour} className="behaviour-chip">
                  {entry.behaviour} <strong>{entry.count}</strong>
                </span>
              ))}
            </div>
            {mix.mismatch && mix.dominant ? (
              <p className="behaviour-flag">
                Customers here mostly behave as a <strong>{mix.dominant}</strong> purchase, which is
                not what a <strong>{mix.intendedRole}</strong> category assumes — worth
                investigating how it is ranged and priced.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <Coverage coverage={coverage} />
    </>
  );
}

/**
 * What the category breakdown above leaves out, and why.
 *
 * Silent when everything is accounted for — a note that always says "nothing
 * missing" stops being read, and then it is not read on the day it matters.
 */
function Coverage({ coverage }: { coverage: CategoryCoverage }) {
  const { resolved, unresolved, outsideRange, unresolvedPhrases } = coverage;
  if (unresolved === 0 && outsideRange === 0) return null;

  const total = resolved + unresolved + outsideRange;
  return (
    <p className="demand-coverage" role="note">
      {resolved} of {total} interactions are grouped above.
      {outsideRange > 0
        ? ` ${outsideRange} named something outside the categories ANUMA covers.`
        : ""}
      {unresolved > 0 ? (
        <>
          {" "}
          {unresolved} use wording nobody has confirmed a meaning for yet
          {unresolvedPhrases.length > 0 ? (
            <>
              {" — "}
              {unresolvedPhrases
                .slice(0, 4)
                .map((phrase) => `“${phrase.key}”`)
                .join(", ")}
              {unresolvedPhrases.length > 4 ? ` and ${unresolvedPhrases.length - 4} more` : ""}
            </>
          ) : null}
          . Confirm them in Administration to bring them in.
        </>
      ) : null}
    </p>
  );
}

export function DemandIntelligenceView({ data }: { data: DemandIntelligence }) {
  if (data.conversations === 0) {
    return (
      <p className="processing-note" role="status">
        No processed interactions yet. Demand intelligence appears once conversations have been
        transcribed and their records built.
      </p>
    );
  }

  const n = data.conversations;

  return (
    <div className="demand-intelligence">
      <p className="demand-scope">
        Across <strong>{n}</strong> processed interaction{n === 1 ? "" : "s"} in the last{" "}
        {data.windowDays} days. Every figure is counted from evidence-backed facts — no model
        produced these numbers.
      </p>

      <dl className="demand-headline">
        <div>
          <dt>Interactions</dt>
          <dd>{n}</dd>
        </div>
        <div>
          <dt>Purchased</dt>
          <dd className="demand-won">{data.purchased}</dd>
        </div>
        <div>
          <dt>Follow-up</dt>
          <dd>{data.followUp}</dd>
        </div>
        <div>
          <dt>Median budget</dt>
          <dd>{rupees(data.budget.median, data.budget.currency)}</dd>
        </div>
        <div>
          <dt>Clarified need</dt>
          <dd>
            {data.clarityImproved.measured > 0
              ? `${data.clarityImproved.improved}/${data.clarityImproved.measured}`
              : "—"}
          </dd>
        </div>
      </dl>

      <Section label="Demand" title="What customers want">
        <Panel title="What keeps coming up">
          <Bars items={data.themes} total={n} empty="No recurring themes yet." />
        </Panel>
        <Panel title="What customers keep asking">
          <Dimensions items={data.questionTopics} />
        </Panel>
        <Panel title="Use cases">
          <Bars items={data.useCases} total={n} />
        </Panel>
        <Panel title="Brands requested">
          <Bars items={data.brands} total={n} empty="No brand preference stated yet." />
        </Panel>
        <Panel title="Requirement dimensions">
          <Dimensions items={data.requirementDimensions} />
        </Panel>
        <Panel title="Budget bands">
          <Bars items={data.budgetBands} total={n} empty="No budgets stated yet." />
        </Panel>
        <Panel title="Purchase urgency">
          <Bars items={data.urgency} total={n} empty="No timing stated yet." />
        </Panel>
      </Section>

      <Section label="Understanding" title="Did we understand them?">
        <Panel title="Clarity on arrival">
          <Bars
            items={data.clarityStart}
            total={data.clarityImproved.measured}
            empty="Not measured yet."
          />
        </Panel>
        <Panel title="Clarity at close">
          <Bars
            items={data.clarityEnd}
            total={data.clarityImproved.measured}
            empty="Not measured yet."
          />
        </Panel>
        <Panel title="Discovery work">
          <p className="demand-highlight">
            {data.clarityImproved.measured > 0 ? (
              <>
                <strong>
                  {Math.round(
                    (data.clarityImproved.improved / data.clarityImproved.measured) * 100,
                  )}
                  %
                </strong>{" "}
                of customers left clearer about what they needed than they arrived.
              </>
            ) : (
              "Requirement clarity is not measured yet."
            )}
          </p>
        </Panel>
      </Section>

      <Section label="Competition" title="Competitive pressure">
        <Panel title="Competitors named">
          <Bars items={data.competitors} total={n} empty="No competitor named yet." />
        </Panel>
        <Panel title="Their products">
          <Bars
            items={data.competitorProducts}
            total={n}
            empty="No competitor product cited yet."
          />
        </Panel>
        <Panel title="Shadow prices · customer-claimed">
          <Shadow items={data.shadowPrices} />
        </Panel>
      </Section>

      <Section label="Architecture" title="How customers decide" wide>
        <div className="demand-columns">
          <Panel title="Decision order · what they weigh first">
            <DecisionOrder filters={data.decisionHierarchy} />
            <p className="panel-caveat">
              The order topics surface in conversation. A representative&rsquo;s questioning shapes
              this too, so read it as a strong proxy for the customer&rsquo;s decision hierarchy —
              not a direct reading of intent.
            </p>
          </Panel>
          <Panel title="How customers actually buy">
            <Behaviour mixes={data.behaviour} coverage={data.categoryCoverage} />
          </Panel>
        </div>
      </Section>

      <Section label="Leakage" title="Where demand leaks" wide>
        <Funnel leakage={data.leakage} />
      </Section>

      <Section label="Friction" title="Why demand leaks">
        <Panel title="Objections raised">
          <Bars items={data.objectionClusters} total={n} empty="No objections recorded yet." />
        </Panel>
        <Panel title="Lost & pending demand">
          <p className="demand-highlight">
            <strong>{data.lostDemand.count}</strong> interaction
            {data.lostDemand.count === 1 ? "" : "s"} did not convert.
            {data.lostDemand.topReason ? (
              <>
                {" "}
                Most common friction: <strong>{data.lostDemand.topReason}</strong>.
              </>
            ) : null}
          </p>
        </Panel>
        <Panel title="Flagged for review">
          <p className="demand-highlight">
            <strong>{pct(data.redFlagRate)}</strong> of interactions had a moment a manager should
            review.
          </p>
          <Bars items={data.redFlagCategories} total={n} empty="No red flags raised." />
        </Panel>
      </Section>

      <Section label="Execution" title="How well we sold">
        <Panel title="Rep execution">
          <dl className="demand-stats">
            <div className="demand-stat">
              <dt>Objection coverage</dt>
              <dd>{pct(data.objectionCoverage)}</dd>
            </div>
            <div className="demand-stat">
              <dt>Alternative offered</dt>
              <dd>{pct(data.alternativeOfferRate)}</dd>
            </div>
            <div className="demand-stat">
              <dt>Product demoed</dt>
              <dd>{pct(data.demoRate)}</dd>
            </div>
            <div className="demand-stat">
              <dt>Cross-sell offered</dt>
              <dd>{pct(data.crossSellRate)}</dd>
            </div>
            <div className="demand-stat">
              <dt>Upsell offered</dt>
              <dd>{pct(data.upsellRate)}</dd>
            </div>
            <div className="demand-stat">
              <dt>Finance interest</dt>
              <dd>
                {data.financeInterest}/{n}
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Products recommended">
          <Bars items={data.productsRecommended} total={n} empty="No products recommended yet." />
        </Panel>
        <Panel title="How it ended">
          <Bars items={data.decisionStates} total={n} />
        </Panel>
      </Section>
    </div>
  );
}
