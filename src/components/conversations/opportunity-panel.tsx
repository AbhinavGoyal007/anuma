import type { ConversationOpportunity } from "@/modules/catalogue/opportunity";

/**
 * What the customer could have been shown.
 *
 * The screen leads with what was checked rather than with the number, because
 * the number is worth exactly as much as the share of the customer's words
 * behind it. A panel that says "26 in stock matched" while having checked one
 * requirement out of four is telling a manager something it has not established,
 * and this is the one place the product accuses a member of their staff.
 */

function money(minor: number | null, currency = "USD"): string {
  if (minor === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function OpportunityPanel({
  opportunity,
}: {
  opportunity: ConversationOpportunity | null;
}) {
  if (!opportunity) {
    return (
      <section className="product-panel" aria-labelledby="opportunity-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Against the range</p>
            <h2 id="opportunity-title">Could we have sold something?</h2>
          </div>
        </div>
        <p className="demand-empty">
          Nothing to compare yet. This needs a completed record for the conversation and a product
          catalogue with attributes loaded.
        </p>
      </section>
    );
  }

  const checked = opportunity.checked.filter((requirement) => requirement.matchedTo !== null);

  return (
    <section className="product-panel" aria-labelledby="opportunity-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Against the range</p>
          <h2 id="opportunity-title">Could we have sold something?</h2>
        </div>
      </div>

      {opportunity.nothingChecked ? (
        <p className="demand-empty">
          Nothing the customer asked for could be checked against this catalogue, so there is no
          answer here — not an empty one.
          {opportunity.uncheckable.length > 0 ? (
            <> They wanted: {opportunity.uncheckable.join("; ")}.</>
          ) : null}
        </p>
      ) : (
        <>
          <p className="requirement-question">
            Checked {checked.length} of {opportunity.checked.length} stated requirement
            {opportunity.checked.length === 1 ? "" : "s"}
            {opportunity.budgetMinor !== null ? (
              <> and a ceiling of {money(opportunity.budgetMinor)}</>
            ) : null}
            .
          </p>

          <ul className="requirement-list">
            {checked.map((requirement) => (
              <li key={requirement.phrase}>
                <span className="requirement-phrase">{requirement.phrase}</span>
                <span className="requirement-match"> → {requirement.matchedTo}</span>
              </li>
            ))}
          </ul>

          <p className="requirement-verdict">
            {opportunity.qualifyingCount === 0
              ? "Nothing in stock met what they asked for."
              : `${opportunity.qualifyingCount.toLocaleString()} in stock met it — ${opportunity.shownCount} shown, ${(
                  opportunity.qualifyingCount - opportunity.shownCount
                ).toLocaleString()} never mentioned.`}
          </p>

          {opportunity.falselyUnavailable ? (
            <p className="requirement-flag">
              The record says the customer was told this was unavailable.
            </p>
          ) : null}

          {opportunity.neverShown.length > 0 ? (
            <ul className="requirement-examples">
              {opportunity.neverShown.map((item) => (
                <li key={`${item.description}-${item.priceMinor}`}>
                  {item.description}
                  {item.priceMinor !== null ? <> — {money(item.priceMinor)}</> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {opportunity.uncheckable.length > 0 ? (
            <p className="requirement-caveat">
              Could not check: {opportunity.uncheckable.join("; ")}. Nothing in this catalogue
              records {opportunity.uncheckable.length === 1 ? "it" : "them"}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
