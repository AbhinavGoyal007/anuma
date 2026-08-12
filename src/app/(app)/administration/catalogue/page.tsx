import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApplicationContext } from "@/modules/identity/application-context";
import { getCatalogueHealth } from "@/modules/catalogue/health";

/**
 * What the range says, and where it stops saying it.
 *
 * A catalogue is not evidence in the way a transcript is — nobody disputes what
 * a row contains. What is disputed, constantly, is whether the row is complete
 * enough to answer a question with, and this screen exists to settle that in
 * advance rather than halfway through an assortment argument.
 *
 * It leads with the fault worth raising with the retailer, because that is the
 * only one a person can act on: descriptions cut off at a column width are one
 * conversation to fix and tens of thousands of rows to correct by hand.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CatalogueHealthPage() {
  const context = await getApplicationContext();
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization } = context.current;
  const health = await getCatalogueHealth(organization.id);
  const faults = health.issues.filter((issue) => issue.isDataFault && issue.itemCount > 0);

  return (
    <>
      <PageHeader eyebrow="Product range" title="Catalogue" />

      {health.currentItems === 0 ? (
        <section className="product-panel" aria-labelledby="catalogue-empty-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nothing loaded</p>
              <h2 id="catalogue-empty-title">No catalogue yet</h2>
            </div>
          </div>
          <p className="section-copy">
            No product range has been loaded for {organization.name}. Until one is, an interaction
            can say a customer wanted a 16GB laptop but nothing can say whether the range held one.
          </p>
          <p className="section-copy">
            A catalogue export is loaded from the command line — a first import of a large range
            runs for longer than a web request may stay open.
          </p>
        </section>
      ) : (
        <>
          <section className="summary-grid" aria-label="Catalogue summary">
            <article className="summary-card summary-card-primary">
              <p className="eyebrow">Products in range</p>
              <h2>{health.currentItems.toLocaleString()}</h2>
              {health.lastImport ? (
                <p>
                  {health.lastImport.filename ?? "import"} ·{" "}
                  {formatDate(health.lastImport.createdAt)}
                </p>
              ) : (
                <p>No completed import recorded.</p>
              )}
            </article>
            <article className="summary-card">
              <p className="eyebrow">Specifications read</p>
              <h2>{health.parsedItems.toLocaleString()}</h2>
              <StatusBadge
                label={
                  health.parsedItems === health.currentItems
                    ? "Every row read"
                    : `${(health.currentItems - health.parsedItems).toLocaleString()} not yet read`
                }
                tone={health.parsedItems === health.currentItems ? "verified" : "warning"}
              />
            </article>
          </section>

          {health.lastImport ? (
            <section className="product-panel" aria-labelledby="last-import-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Most recent import</p>
                  <h2 id="last-import-title">What the last file changed</h2>
                </div>
              </div>
              <ul className="record-list">
                <li>
                  <div>
                    <strong>{health.lastImport.addedCount.toLocaleString()} added</strong>
                    <span>Products the range did not carry before.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>{health.lastImport.changedCount.toLocaleString()} changed</strong>
                    <span>
                      Re-described or re-classified. The previous version is kept, so a finding
                      about an older conversation is still judged against what was true then.
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>{health.lastImport.delistedCount.toLocaleString()} delisted</strong>
                    <span>No longer in the file. Their history remains.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>{health.lastImport.unchangedCount.toLocaleString()} unchanged</strong>
                    <span>Identical to the previous import.</span>
                  </div>
                </li>
              </ul>
            </section>
          ) : null}

          {faults.length > 0 ? (
            <section className="product-panel" aria-labelledby="catalogue-faults-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Worth raising with the retailer</p>
                  <h2 id="catalogue-faults-title">Faults in the source data</h2>
                </div>
                <span className="count-label">
                  {faults.reduce((total, issue) => total + issue.itemCount, 0).toLocaleString()}{" "}
                  rows
                </span>
              </div>
              <p className="section-copy">
                These are not products that lack a specification — they are products whose
                specification was damaged on the way here. Each is one conversation to fix at source
                and tens of thousands of rows to correct by hand.
              </p>
              <ul className="spec-issue-list">
                {faults.map((issue) => (
                  <li key={issue.key} className="spec-issue spec-issue--fault">
                    <div className="spec-issue-head">
                      <strong>{issue.title}</strong>
                      <span className="spec-issue-count">
                        {issue.itemCount.toLocaleString()} products
                      </span>
                    </div>
                    <p className="spec-issue-copy">{issue.explanation}</p>
                    {issue.exampleDescription ? (
                      <p className="spec-issue-example">
                        <span>For example</span>
                        <code>{issue.exampleDescription}</code>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="product-panel" aria-labelledby="catalogue-readability-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Specification reading</p>
                <h2 id="catalogue-readability-title">How much of the range can be matched</h2>
              </div>
            </div>
            <p className="section-copy">
              A product can only answer &ldquo;did we have one with 16GB&rdquo; if its specification
              was understood. Grouped by the reason, so one rule fixes a whole group rather than a
              person correcting rows one at a time.
            </p>
            <ul className="spec-issue-list">
              {health.issues.map((issue) => (
                <li key={issue.key} className="spec-issue">
                  <div className="spec-issue-head">
                    <strong>{issue.title}</strong>
                    <span className="spec-issue-count">
                      {issue.itemCount.toLocaleString()} products
                    </span>
                  </div>
                  <p className="spec-issue-copy">{issue.explanation}</p>
                  {issue.exampleDescription ? (
                    <p className="spec-issue-example">
                      <span>For example</span>
                      <code>{issue.exampleDescription}</code>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="section-copy">
              A product may appear under more than one reason — a row can be both cut off and carry
              no specification.
            </p>
          </section>
        </>
      )}

      <p className="section-copy">
        <Link href="/administration/categories">Category mapping</Link> ·{" "}
        <Link href="/administration">Back to Administration</Link>
      </p>
    </>
  );
}
