import {
  correctFieldValue,
  rejectFieldValue,
} from "@/modules/interaction-record/correction-actions";
import type { InteractionRecord, RecordFieldValue } from "@/modules/interaction-record/data";
import { sourceClassMeaning, type SourceClass } from "@/modules/interaction-record/source-class";

/**
 * The Commercial Interaction Record, as a category head would read it.
 *
 * The founder's guide is emphatic that the trust class must be visible: an
 * invoice figure and a model's reading of a noisy shop floor cannot look like
 * the same kind of statement. So every value is tagged with its source class,
 * money is shown both resolved and as spoken, and an abstention is rendered as
 * the finding it is rather than hidden as an empty row.
 */

const FIELD_LABELS: Record<string, string> = {
  language_mix: "Language",
  customer_party_size: "Party size",
  purchase_category: "Category",
  arrival_intent_state: "Arrival intent",
  initial_request: "Initial request",
  purchase_use_cases: "Use cases",
  target_budget: "Target budget",
  maximum_budget: "Maximum budget",
  purchase_timing: "Timing",
  brand_preferences: "Brand preference",
  specification_requirements: "Specification",
  additional_requirements: "Requirement",
  other_constraints: "Other constraints",
  decision_drivers: "Decision drivers",
  requirement_origin: "Requirement origin",
  requirement_clarity_start: "Clarity on arrival",
  requirement_clarity_end: "Clarity at close",
  products_considered: "Products considered",
  products_recommended: "Products recommended",
  recommendation_reasons: "Why recommended",
  store_price_quoted: "Price quoted",
  competitor_named: "Competitor named",
  competitor_product: "Competitor product",
  competitor_price_claim: "Competitor price (claimed)",
  stock_status: "Stock status",
  promotion_discussed: "Promotion",
  finance_requested: "Finance",
  objections: "Objection",
  objection_response: "Objection handled",
  alternative_offered: "Alternative offered",
  product_demo_performed: "Demo performed",
  next_action: "Next action",
  final_decision_state: "Decision",
  cross_sell_offered: "Cross-sell offered",
  cross_sell_pitch: "Cross-sell pitched",
  cross_sell_hierarchy: "Cross-sell placement",
  upsell_offered: "Upsell offered",
  upsell_pitch: "Upsell pitched",
  upsell_hierarchy: "Upsell placement",
  confirmed_business_outcome: "Business outcome",
  outcome_basis: "Outcome evidence",
};

const SOURCE_LABEL: Record<SourceClass, string> = {
  verified: "Verified",
  evidence_extracted: "Said",
  evaluated: "Judged",
  inferred: "Inferred",
};

/**
 * The curated short label for a standard field, or the field's own display name
 * for anything else — a custom tag reads with the name the business gave it,
 * while the standard record keeps its familiar wording.
 */
function fieldLabel(value: RecordFieldValue): string {
  return FIELD_LABELS[value.fieldKey] ?? value.displayLabel;
}

function formatMoney(value: RecordFieldValue): string {
  if (value.amountMinor === null) return "";
  const major = value.amountMinor / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: value.currency ?? "INR",
    maximumFractionDigits: 0,
  }).format(major);
  return formatted;
}

function ValueRow({
  value,
  canCorrect,
  conversationId,
}: {
  value: RecordFieldValue;
  canCorrect: boolean;
  conversationId: string;
}) {
  const abstained = value.abstention !== null;
  const money = value.amountMinor !== null ? formatMoney(value) : null;
  const display =
    money ?? value.valueText ?? (value.valueNumber !== null ? String(value.valueNumber) : null);
  const correction = value.correction;
  const superseded = correction !== null;

  return (
    <div className={`record-row${abstained ? " record-row--abstained" : ""}`}>
      <div className="record-row-head">
        <span className="record-field">
          {fieldLabel(value)}
          {value.label ? (
            <span className="record-dimension"> · {value.label.replaceAll("_", " ")}</span>
          ) : null}
        </span>
        <span className={`record-source record-source--${value.sourceClass}`}>
          {SOURCE_LABEL[value.sourceClass]}
        </span>
        {value.attributedTo ? (
          <span className="record-attribution">{value.attributedTo}</span>
        ) : null}
      </div>
      {abstained ? (
        <span className="record-abstained">{value.abstention?.replaceAll("_", " ")}</span>
      ) : (
        <div className="record-value">
          <span className={superseded ? "record-superseded" : undefined}>{display}</span>
          {money && value.spokenAmount !== null ? (
            <span className="record-spoken">
              said &ldquo;{value.spokenAmount} {value.spokenScale}&rdquo;
            </span>
          ) : null}
          {value.hasEvidence ? (
            <span className="record-evidence" title="Backed by transcript evidence">
              ◦ evidenced
            </span>
          ) : null}
        </div>
      )}

      {correction && !correction.isRejected ? (
        <p className="record-correction">
          <span className="record-correction-badge">corrected</span>
          <strong>{correction.correctedText}</strong>
          {correction.note ? (
            <span className="record-correction-note"> — {correction.note}</span>
          ) : null}
        </p>
      ) : null}
      {correction?.isRejected ? (
        <p className="record-correction record-correction--rejected">
          <span className="record-correction-badge">marked wrong</span>
          {correction.note ? (
            <span className="record-correction-note"> — {correction.note}</span>
          ) : null}
        </p>
      ) : null}

      {canCorrect ? (
        <details className="record-correct">
          <summary>{correction ? "Re-correct" : "Correct"}</summary>
          <form action={correctFieldValue} className="record-correct-form">
            <input type="hidden" name="valueId" value={value.valueId} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <label>
              <span>The correct value</span>
              <input
                name="correctedText"
                defaultValue={correction?.correctedText ?? ""}
                maxLength={400}
                required
              />
            </label>
            <label>
              <span>Note (optional)</span>
              <input name="note" maxLength={500} />
            </label>
            <div className="record-correct-actions">
              <button type="submit" className="button button-primary">
                Save correction
              </button>
            </div>
          </form>
          <form action={rejectFieldValue} className="record-reject-form">
            <input type="hidden" name="valueId" value={value.valueId} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <input name="note" placeholder="Why is this wrong? (optional)" maxLength={500} />
            <button type="submit" className="button button-danger">
              Mark wrong
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

export function InteractionRecordPanel({
  record,
  canCorrect = false,
  conversationId,
}: {
  record: InteractionRecord | null;
  canCorrect?: boolean;
  conversationId: string;
}) {
  if (!record) return null;

  if (record.status !== "completed") {
    return (
      <section className="interaction-record" aria-labelledby="interaction-record-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Commercial interaction record</p>
            <h2 id="interaction-record-title">Demand and commercial facts</h2>
          </div>
        </div>
        <p className="processing-note" role="status">
          {record.status === "failed"
            ? "The interaction record could not be built. It will be retried."
            : "The interaction record is being built from the transcript."}
        </p>
      </section>
    );
  }

  const present = record.values.filter((value) => value.abstention === null);
  const abstained = record.values.filter((value) => value.abstention !== null);

  return (
    <section className="interaction-record" aria-labelledby="interaction-record-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Commercial interaction record</p>
          <h2 id="interaction-record-title">Demand and commercial facts</h2>
        </div>
        <span className="record-count">{present.length} facts</span>
      </div>

      {record.summary ? <p className="record-summary">{record.summary}</p> : null}

      <p className="record-legend">
        {(Object.keys(SOURCE_LABEL) as SourceClass[]).map((source) => (
          <span key={source} className={`record-source record-source--${source}`}>
            {SOURCE_LABEL[source]}
          </span>
        ))}
        <span className="record-legend-note">
          Each fact carries how it is known. {sourceClassMeaning.evidence_extracted}; not proven.
        </span>
      </p>

      <div className="record-list">
        {present.map((value, index) => (
          <ValueRow
            key={`${value.fieldKey}-${index}`}
            value={value}
            canCorrect={canCorrect}
            conversationId={conversationId}
          />
        ))}
      </div>

      {abstained.length ? (
        <details className="record-abstentions">
          <summary>{abstained.length} not stated in this conversation</summary>
          <div className="record-abstention-list">
            {abstained.map((value, index) => (
              <span key={`${value.fieldKey}-${index}`} className="record-abstention-chip">
                {fieldLabel(value)}
              </span>
            ))}
          </div>
        </details>
      ) : null}

      {record.rejectedValueCount > 0 ? (
        <p className="record-footnote">
          {record.rejectedValueCount} extracted value
          {record.rejectedValueCount === 1 ? "" : "s"} were discarded for lacking transcript
          evidence.
        </p>
      ) : null}
    </section>
  );
}
