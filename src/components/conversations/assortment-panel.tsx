import type { ConversationAssortment, ResolvedMention } from "@/modules/catalogue/assortment";
import type { Facet, SkuMatch } from "@/modules/catalogue/sku-match";

/**
 * Did we have what this customer wanted?
 *
 * The finding leads; the evidence for it sits underneath. Each product the
 * conversation named is shown against the rows in the range it could be, and
 * every row states *why* it was offered — memory agreed, graphics agreed — so a
 * category manager can see in one glance that a match rests on the right things
 * rather than on a number somebody trusted.
 *
 * Where the answer is unknown it says unknown. A mention nobody can resolve, a
 * description the export cut off, a conversation older than the catalogue's own
 * memory: each of those is a different sentence, and collapsing them into "no
 * match" would be the one dishonest thing this panel could do.
 */

const FIELD_LABEL: Record<string, string> = {
  products_considered: "Considered",
  products_recommended: "Recommended",
  competitor_product: "Competitor's",
};

const CONFIDENCE_COPY: Record<ResolvedMention["confidence"], string> = {
  exact: "One product in the range fits everything that was said.",
  likely: "Several products fit everything that was said.",
  ambiguous: "Fits, but the catalogue text was cut off before it could confirm.",
  none: "Nothing in the range matched what was said.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** What agreed and what could not be checked, in the words of the two sides. */
function Facets({ facets }: { facets: Facet[] }) {
  const stated = facets.filter((facet) => facet.verdict !== "unstated");
  if (stated.length === 0) return null;
  return (
    <ul className="facet-list">
      {stated.map((facet) => (
        <li key={facet.name} className={`facet facet--${facet.verdict}`}>
          <span className="facet-name">{facet.name}</span>
          <span className="facet-value">
            {facet.verdict === "unreadable"
              ? `${facet.wanted} — catalogue text cut off`
              : (facet.found ?? "—")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MatchRow({ match }: { match: SkuMatch }) {
  return (
    <li className="sku-match">
      <div className="sku-match-head">
        <strong className="sku-description">{match.item.description}</strong>
        <span className="sku-id">{match.item.itemId}</span>
      </div>
      {match.item.subgroupName ? (
        <p className="sku-taxonomy">
          {match.item.groupName} › {match.item.subgroupName}
        </p>
      ) : null}
      <Facets facets={match.facets} />
    </li>
  );
}

function Mention({ mention }: { mention: ResolvedMention }) {
  return (
    <li className="mention">
      <div className="mention-head">
        <span className="mention-field">{FIELD_LABEL[mention.fieldKey] ?? mention.fieldKey}</span>
        <strong className="mention-spoken">&ldquo;{mention.spoken}&rdquo;</strong>
      </div>
      <p className="mention-verdict">
        {mention.tooVague
          ? "No brand or model was named, so there is nothing to look up. Not a gap in the range."
          : CONFIDENCE_COPY[mention.confidence]}
      </p>
      {mention.matches.length > 0 ? (
        <ul className="sku-match-list">
          {mention.matches.map((match) => (
            <MatchRow key={match.item.id} match={match} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function AssortmentPanel({ assortment }: { assortment: ConversationAssortment }) {
  if (assortment.catalogueEmpty) {
    return (
      <section className="product-panel" aria-labelledby="assortment-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Against the range</p>
            <h2 id="assortment-title">Did we have it?</h2>
          </div>
        </div>
        <p className="demand-empty">
          No product catalogue has been loaded, so this conversation cannot be checked against the
          range. That is a missing catalogue, not a missing product.
        </p>
      </section>
    );
  }

  const { mentions, requirement } = assortment;

  return (
    <section className="product-panel" aria-labelledby="assortment-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Against the range</p>
          <h2 id="assortment-title">Did we have it?</h2>
        </div>
        <span className="count-label">as of {formatDate(assortment.asOf)}</span>
      </div>

      {assortment.historyBeganAt ? (
        <p className="assortment-caveat" role="note">
          This conversation is older than the catalogue&rsquo;s records, which begin on{" "}
          {formatDate(assortment.historyBeganAt)}. It is checked against that first snapshot, so
          treat the answer as what the range held shortly after — not what it held on the day.
        </p>
      ) : null}

      {requirement ? (
        <div className="requirement-answer">
          <p className="requirement-question">
            The customer wanted a <strong>{requirement.categoryLabel.toLowerCase()}</strong>
            {requirement.wanted.ramGb || requirement.wanted.storageGb ? (
              <>
                {" "}
                with at least{" "}
                {[
                  requirement.wanted.ramGb ? `${requirement.wanted.ramGb}GB memory` : null,
                  requirement.wanted.storageGb ? `${requirement.wanted.storageGb}GB storage` : null,
                ]
                  .filter(Boolean)
                  .join(" and ")}
              </>
            ) : null}
            .
          </p>
          <p className="requirement-verdict">
            {requirement.matchingCount === 0
              ? "Nothing in the range met that on this date."
              : `${requirement.matchingCount.toLocaleString()} products in the range met it.`}
          </p>
          {requirement.examples.length > 0 ? (
            <ul className="sku-match-list">
              {requirement.examples.map((example) => (
                <li className="sku-match" key={example.id}>
                  <div className="sku-match-head">
                    <strong className="sku-description">{example.description}</strong>
                    <span className="sku-id">{example.itemId}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {mentions.length > 0 ? (
        <ul className="mention-list">
          {mentions.map((mention) => (
            <Mention key={`${mention.fieldKey}-${mention.spoken}`} mention={mention} />
          ))}
        </ul>
      ) : (
        <p className="demand-empty">
          No specific product was named in this conversation, so there is nothing to look up in the
          range.
        </p>
      )}
    </section>
  );
}
