import Link from "next/link";
import { redirect } from "next/navigation";

import {
  confirmLabelMapping,
  confirmPhraseMapping,
  refreshCategoryProposals,
} from "@/app/(app)/administration/categories/actions";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  getCategoryMappingWorkspace,
  MAPPING_PAGE_SIZE,
  type CategoryOption,
  type LabelMapping,
  type MappingStatus,
  type PhraseMapping,
} from "@/modules/catalogue/repository";

/**
 * Confirming what the words around a category mean.
 *
 * Two vocabularies describe the same shelf. The retailer's catalogue calls a
 * laptop a "Clamshell" or a "Copilot+ PC"; the customer asks for a "2 bhk flat"
 * one day and a "residential property / apartment" the next. Neither is wrong,
 * and neither can be the spine an analytic stands on — one changes daily, the
 * other changes by the sentence.
 *
 * So both are confirmed once, here, into ANUMA's own categories, and every
 * rollup in the product groups by what was confirmed. The queue leads with the
 * labels covering the most items and the phrasings covering the most
 * interactions, because that is the order in which confirming one actually
 * changes what a category head sees.
 */

type PageProps = {
  searchParams: Promise<{ error?: string; saved?: string; proposed?: string }>;
};

const STATUS_LABEL: Record<MappingStatus, string> = {
  proposed: "Waiting",
  confirmed: "Confirmed",
  not_relevant: "Not relevant",
};

function CategorySelect({
  name,
  categories,
  selected,
  describedBy,
  label,
}: {
  name: string;
  categories: CategoryOption[];
  selected: string | null;
  describedBy: string;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      aria-describedby={describedBy}
      className="mapping-select"
      defaultValue={selected ?? ""}
      name={name}
    >
      <option value="">Choose a category…</option>
      {categories.map((category) => (
        <option key={category.key} value={category.key}>
          {category.label}
        </option>
      ))}
    </select>
  );
}

/**
 * One decision.
 *
 * Accept and Not relevant submit the same form, so whatever the reader changed
 * in the dropdown is what gets saved — "Change" is not a separate action, it is
 * the dropdown plus Accept.
 */
function MappingRow({
  id,
  action,
  title,
  context,
  status,
  selected,
  score,
  categories,
  canEdit,
}: {
  id: string;
  action: (formData: FormData) => Promise<void>;
  title: string;
  context: string;
  status: MappingStatus;
  selected: string | null;
  score: number | null;
  categories: CategoryOption[];
  canEdit: boolean;
}) {
  const contextId = `mapping-context-${id}`;
  return (
    <li className={`mapping-row mapping-row--${status}`}>
      <div className="mapping-identity">
        <strong className="mapping-title">{title}</strong>
        <small className="mapping-context" id={contextId}>
          {context}
          {status === "proposed" && score !== null ? (
            <span className="mapping-score"> · suggested {Math.round(score * 100)}%</span>
          ) : null}
        </small>
      </div>

      {canEdit ? (
        <form action={action} className="mapping-decision">
          <input name="id" type="hidden" value={id} />
          <CategorySelect
            categories={categories}
            describedBy={contextId}
            label={`ANUMA category for ${title}`}
            name="anuma_category_key"
            selected={selected}
          />
          <button className="button button-primary mapping-action" name="intent" value="confirm">
            {status === "proposed" ? "Accept" : "Update"}
          </button>
          <button
            className="button button-secondary mapping-action"
            name="intent"
            value="not_relevant"
          >
            Not relevant
          </button>
        </form>
      ) : (
        <div className="mapping-decision mapping-decision--readonly">
          <span className="mapping-resolved">
            {categories.find((category) => category.key === selected)?.label ?? "—"}
          </span>
          <StatusBadge
            label={STATUS_LABEL[status]}
            tone={status === "confirmed" ? "verified" : undefined}
          />
        </div>
      )}
    </li>
  );
}

export default async function CategoryMappingPage({ searchParams }: PageProps) {
  const [context, message] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership } = context.current;
  const isAdmin = membership.role === "admin";
  const workspace = await getCategoryMappingWorkspace(organization.id);
  const { categories, labels, phrases } = workspace;

  const labelsTotal = labels.pendingTotal + labels.settledTotal;
  const phrasesTotal = phrases.pendingTotal + phrases.settledTotal;
  const nothingToShow = labelsTotal === 0 && phrasesTotal === 0;

  return (
    <>
      <PageHeader eyebrow="Category mapping" title="What your labels mean" />

      {message.error ? (
        <p className="auth-message auth-message-error" role="alert">
          {message.error}
        </p>
      ) : null}
      {message.saved ? (
        <p className="auth-message" role="status">
          Mapping saved. Customer Intelligence will group by it from now on.
        </p>
      ) : null}
      {message.proposed ? (
        <p className="auth-message" role="status">
          {message.proposed === "0"
            ? "Nothing new to map — every label already has a decision."
            : `${message.proposed} label(s) queued for confirmation.`}
        </p>
      ) : null}

      <section className="product-panel" aria-labelledby="mapping-intro-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Why this exists</p>
            <h2 id="mapping-intro-title">One set of categories, two vocabularies</h2>
          </div>
          {isAdmin ? (
            <form action={refreshCategoryProposals}>
              <button className="button button-secondary" type="submit">
                Check for new labels
              </button>
            </form>
          ) : null}
        </div>
        <p className="section-copy">
          Your catalogue&rsquo;s own group names change as the range changes, and customers describe
          what they want differently every time. ANUMA keeps its own stable categories and asks you
          to confirm, once, what each label means. Everything in Customer Intelligence groups by
          what you confirm here — nothing is grouped by a suggestion.
        </p>
        {!isAdmin ? (
          <p className="section-copy">
            You can see these mappings. Changing them is an administrator action.
          </p>
        ) : null}
      </section>

      {nothingToShow ? (
        <section className="product-panel" aria-labelledby="mapping-empty-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nothing to confirm</p>
              <h2 id="mapping-empty-title">No labels have arrived yet</h2>
            </div>
          </div>
          <p className="section-copy">
            {workspace.catalogueItems === 0
              ? "No product catalogue has been loaded for this organization, and no interaction has named a category yet. Labels appear here as soon as either exists."
              : "The catalogue is loaded but no labels have been prepared for confirmation yet."}
          </p>
          {isAdmin && workspace.catalogueItems > 0 ? (
            <form action={refreshCategoryProposals}>
              <button className="button button-primary" type="submit">
                Prepare mappings
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {labelsTotal > 0 ? (
        <section className="product-panel" aria-labelledby="catalogue-labels-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your catalogue&rsquo;s words</p>
              <h2 id="catalogue-labels-title">Catalogue labels</h2>
            </div>
            <span className="count-label">
              {labels.settledTotal} of {labelsTotal} decided
            </span>
          </div>

          {labels.pendingTotal === 0 ? (
            <p className="section-copy">
              Every catalogue label has a decision. New ones appear here when the range changes.
            </p>
          ) : (
            <>
              <p className="section-copy">
                {labels.pendingTotal} waiting, largest first.
                {labels.pendingTotal > MAPPING_PAGE_SIZE
                  ? ` Showing the top ${MAPPING_PAGE_SIZE}.`
                  : ""}
              </p>
              <ul className="mapping-list">
                {labels.pending.map((row: LabelMapping) => (
                  <MappingRow
                    action={confirmLabelMapping}
                    canEdit={isAdmin}
                    categories={categories}
                    context={`${row.itemCount.toLocaleString()} items`}
                    id={row.id}
                    key={row.id}
                    score={row.proposedScore}
                    selected={row.anumaCategoryKey ?? row.proposedKey}
                    status={row.status}
                    title={[row.groupName, row.subgroupName].filter(Boolean).join(" › ")}
                  />
                ))}
              </ul>
            </>
          )}

          {labels.settledTotal > 0 ? (
            <details className="mapping-settled">
              <summary>{labels.settledTotal} already decided</summary>
              <ul className="mapping-list">
                {labels.settled.map((row: LabelMapping) => (
                  <MappingRow
                    action={confirmLabelMapping}
                    canEdit={isAdmin}
                    categories={categories}
                    context={`${row.itemCount.toLocaleString()} items · ${STATUS_LABEL[row.status]}`}
                    id={row.id}
                    key={row.id}
                    score={row.proposedScore}
                    selected={row.anumaCategoryKey}
                    status={row.status}
                    title={[row.groupName, row.subgroupName].filter(Boolean).join(" › ")}
                  />
                ))}
              </ul>
              {labels.settledTotal > MAPPING_PAGE_SIZE ? (
                <p className="section-copy">
                  Showing the {MAPPING_PAGE_SIZE} largest of {labels.settledTotal}.
                </p>
              ) : null}
            </details>
          ) : null}
        </section>
      ) : null}

      {phrasesTotal > 0 ? (
        <section className="product-panel" aria-labelledby="spoken-labels-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your customers&rsquo; words</p>
              <h2 id="spoken-labels-title">What customers ask for</h2>
            </div>
            <span className="count-label">
              {phrases.settledTotal} of {phrasesTotal} decided
            </span>
          </div>
          <p className="section-copy">
            Taken from what was actually said in interactions. Until a phrasing is confirmed, the
            interactions using it are counted as unresolved on the dashboard rather than guessed
            into a category.
          </p>

          {phrases.pendingTotal > 0 ? (
            <ul className="mapping-list">
              {phrases.pending.map((row: PhraseMapping) => (
                <MappingRow
                  action={confirmPhraseMapping}
                  canEdit={isAdmin}
                  categories={categories}
                  context={`${row.occurrenceCount} interaction${row.occurrenceCount === 1 ? "" : "s"}`}
                  id={row.id}
                  key={row.id}
                  score={row.proposedScore}
                  selected={row.anumaCategoryKey}
                  status={row.status}
                  title={row.phrase}
                />
              ))}
            </ul>
          ) : (
            <p className="section-copy">Every phrasing heard so far has a decision.</p>
          )}

          {phrases.settledTotal > 0 ? (
            <details className="mapping-settled">
              <summary>{phrases.settledTotal} already decided</summary>
              <ul className="mapping-list">
                {phrases.settled.map((row: PhraseMapping) => (
                  <MappingRow
                    action={confirmPhraseMapping}
                    canEdit={isAdmin}
                    categories={categories}
                    context={`${row.occurrenceCount} interaction${row.occurrenceCount === 1 ? "" : "s"} · ${STATUS_LABEL[row.status]}`}
                    id={row.id}
                    key={row.id}
                    score={row.proposedScore}
                    selected={row.anumaCategoryKey}
                    status={row.status}
                    title={row.phrase}
                  />
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      <p className="section-copy">
        <Link href="/administration">Back to Administration</Link>
      </p>
    </>
  );
}
