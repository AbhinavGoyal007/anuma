import {
  commercialActions,
  hasCommercialActions,
  type CommercialAction,
  type Pitch,
} from "@/modules/interaction-record/commercial-actions";
import type { InteractionRecord } from "@/modules/interaction-record/data";

/**
 * What the representative actually did commercially.
 *
 * Recommending, substituting, moving a customer up and adding something
 * alongside are four different acts, and a store manager reads them differently:
 * an alternative offered means stock or budget got in the way, while an upsell
 * missed is money the store had on the counter and left there. Collapsing them
 * into "products mentioned", which is what the record did before the v1.3 spec
 * separated them, hides both.
 *
 * A verdict of no is shown as loudly as a yes. The interesting conversation is
 * the one where nothing was pitched, and a panel that only appears on success
 * would be a panel that never shows a manager anything worth acting on.
 */

const KIND_LABELS: Record<string, string> = {
  product: "Product",
  service: "Service",
  warranty_service_plan: "Warranty / plan",
  accessory: "Accessory",
  bundle_component: "Bundle",
  storage: "Storage",
  memory: "Memory",
  capacity: "Capacity",
  size: "Size",
  performance: "Performance",
  feature_tier: "Feature tier",
  premium_tier: "Premium tier",
  energy_efficiency: "Energy efficiency",
  service_tier: "Service tier",
  warranty_tier: "Warranty tier",
  other: "Other",
};

const ABSTENTION_LABELS: Record<string, string> = {
  not_stated: "never came up",
  insufficient_evidence: "not enough was said to tell",
  ambiguous: "the conversation reads both ways",
  unknown: "no opportunity arose",
};

function humanize(token: string): string {
  return token.replaceAll("_", " ");
}

function PitchRow({ pitch }: { pitch: Pitch }) {
  return (
    <div className="commercial-pitch">
      <p className="commercial-pitch-what">
        {pitch.what}
        {pitch.kind ? (
          <span className="commercial-pitch-kind">
            {KIND_LABELS[pitch.kind] ?? humanize(pitch.kind)}
          </span>
        ) : null}
      </p>
      {pitch.hierarchy.length > 0 ? (
        <p className="commercial-pitch-path">
          {pitch.hierarchy.map((level) => level.value).join(" › ")}
        </p>
      ) : (
        <p className="commercial-pitch-path commercial-pitch-path--none">
          no category named in the conversation
        </p>
      )}
    </div>
  );
}

function ActionBlock({
  title,
  meaning,
  action,
}: {
  title: string;
  meaning: string;
  action: CommercialAction;
}) {
  const tone = action.verdict === "yes" ? "yes" : action.verdict === "no" ? "no" : "unknown";
  return (
    <div className={`commercial-action commercial-action--${tone}`}>
      <div className="commercial-action-head">
        <h3>{title}</h3>
        <span className={`commercial-verdict commercial-verdict--${tone}`}>
          {action.verdict === "yes"
            ? "Offered"
            : action.verdict === "no"
              ? "Not offered"
              : action.verdict === "uncertain"
                ? "Unclear"
                : "Undetermined"}
        </span>
      </div>
      <p className="commercial-action-meaning">{meaning}</p>
      {action.pitches.length > 0 ? (
        <ul className="commercial-pitch-list">
          {action.pitches.map((pitch, index) => (
            <li key={`${pitch.what}-${index}`} className="commercial-pitch-item">
              <PitchRow pitch={pitch} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="commercial-action-empty">
          {action.verdict === "no"
            ? "The representative did not put anything forward."
            : action.verdict === "uncertain"
              ? "An opportunity was there; what was said does not settle whether it was taken."
              : action.abstention
              ? `Undetermined — ${ABSTENTION_LABELS[action.abstention] ?? humanize(action.abstention)}.`
              : "Nothing recorded."}
        </p>
      )}
    </div>
  );
}

export function CommercialActionsPanel({ record }: { record: InteractionRecord | null }) {
  if (!record || record.status !== "completed") return null;
  const actions = commercialActions(record.values);
  if (!hasCommercialActions(actions)) return null;

  const outcome = actions.outcome;

  return (
    <section className="commercial-actions" aria-labelledby="commercial-actions-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Commercial</p>
          <h2 id="commercial-actions-title">What was put in front of the customer</h2>
        </div>
        {outcome.value ? (
          <span className={`commercial-outcome commercial-outcome--${outcome.value}`}>
            {outcome.value === "sale" ? "Sale" : "No sale"}
            {outcome.basis ? (
              <em>
                {outcome.basis === "verified_metadata" ? "from records" : "from the conversation"}
              </em>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="commercial-grid">
        <ActionBlock
          title="Cross-sell"
          meaning="Something complementary, beyond what the customer came in for."
          action={actions.crossSell}
        />
        <ActionBlock
          title="Upsell"
          meaning="A move upward within the same need — more capacity, a higher tier."
          action={actions.upsell}
        />
      </div>

      <dl className="commercial-context">
        <div>
          <dt>Recommended</dt>
          <dd>
            {actions.recommendations.length > 0
              ? actions.recommendations.join(" · ")
              : "Nothing positioned for the primary need."}
          </dd>
        </div>
        <div>
          <dt>Alternative offered</dt>
          <dd>
            {actions.alternativeOffered === "yes"
              ? "A substitute was put forward after the preferred option failed a constraint."
              : actions.alternativeOffered === "no"
                ? "No substitute was offered."
                : actions.alternativeOffered === "not_applicable"
                  ? "Nothing the customer wanted fell through, so no substitute was needed."
                  : "Undetermined."}
          </dd>
        </div>
      </dl>

      <p className="commercial-note">
        A recommendation suits the primary need, an alternative replaces an option that failed a
        constraint, an upsell moves the customer above their baseline, and a cross-sell adds
        something beside it. Each is judged from what the representative did, not from the price.
      </p>
    </section>
  );
}
