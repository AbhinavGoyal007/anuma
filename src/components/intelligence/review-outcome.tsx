import { saveReviewOutcome } from "@/app/(app)/intelligence/actions";
import {
  ACTION_LABELS,
  ACTION_TYPES,
  NOTE_LIMIT,
  PRIOR_KNOWLEDGE,
  USEFULNESS,
  type FindingReview,
} from "@/modules/intelligence/pilot";

/**
 * What the manager decided, recorded against the finding they decided it about.
 *
 * Shown only on the things the product is asking somebody to act on — a
 * priority action, a priority review, a diagnosis opened for review, and the
 * evidence behind them. Putting it under every descriptive tile would turn a
 * dashboard into a survey, and the answers would stop meaning anything.
 *
 * A plain form posting to a server action, so it works without JavaScript and
 * the answer is durable rather than a piece of client state that disappears on
 * navigation.
 */

export function ReviewOutcome({
  cohortKey,
  page,
  filters,
  returnPath,
  existing,
}: {
  cohortKey: string;
  page: string;
  /** The population filters, replayed so the server can resolve the same scope. */
  filters: Record<string, string>;
  returnPath: string;
  existing: FindingReview | null;
}) {
  const findingKey = `${page}_finding:${cohortKey}`;
  return (
    <form className="ip-review-outcome" action={saveReviewOutcome}>
      {/* Only the page, the cohort and the population filters travel. The
          finding's identity and the fingerprints are recomputed server-side:
          a hidden field is browser-owned and can be pointed at a cohort this
          page never showed. */}
      <input type="hidden" name="cohort_key" value={cohortKey} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="return_path" value={returnPath} />
      {Object.entries(filters).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <p className="ip-drawer-section">Review outcome</p>
      {existing?.reviewedAt ? (
        <p className="ip-meta">
          Marked reviewed {new Date(existing.reviewedAt).toLocaleDateString()}
        </p>
      ) : null}

      <fieldset className="ip-review-field">
        <legend>Useful?</legend>
        {USEFULNESS.map((option) => (
          <label className="ip-review-choice" key={option}>
            <input
              type="radio"
              name="usefulness"
              value={option}
              defaultChecked={existing?.usefulness === option}
            />
            {option === "yes" ? "Yes" : option === "no" ? "No" : "Unclear"}
          </label>
        ))}
      </fieldset>

      <label className="ip-review-field" htmlFor={`action-${findingKey}`}>
        <span>Action</span>
        <select
          className="ip-select"
          id={`action-${findingKey}`}
          name="action_type"
          defaultValue={existing?.actionType ?? "no_action_yet"}
        >
          {ACTION_TYPES.map((option) => (
            <option key={option} value={option}>
              {ACTION_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="ip-review-field">
        <legend>Would you have known this without ANUMA?</legend>
        {PRIOR_KNOWLEDGE.map((option) => (
          <label className="ip-review-choice" key={option}>
            <input
              type="radio"
              name="prior_knowledge"
              value={option}
              defaultChecked={existing?.wouldHaveKnownWithoutAnuma === option}
            />
            {option === "yes" ? "Yes" : option === "no" ? "No" : "Unsure"}
          </label>
        ))}
      </fieldset>

      <label className="ip-review-field" htmlFor={`note-${findingKey}`}>
        <span>Optional note</span>
        <input
          className="ip-select ip-review-note"
          id={`note-${findingKey}`}
          name="note"
          maxLength={NOTE_LIMIT}
          defaultValue={existing?.note ?? ""}
        />
      </label>

      <button className="ip-apply" type="submit">
        Mark reviewed
      </button>
    </form>
  );
}
