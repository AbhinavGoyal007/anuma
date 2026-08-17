import type { CoachingMoment } from "@/modules/interaction-record/coaching";

/**
 * The coaching moments for one interaction — a short "where to improve" list a
 * manager or the rep can scan. Every moment is derived from a fact already in
 * the record, so nothing here is an opinion the record cannot back up.
 */
export function CoachingPanel({ moments }: { moments: CoachingMoment[] }) {
  return (
    <section className="interaction-record" aria-labelledby="coaching-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Coaching</p>
          <h2 id="coaching-title">Where to improve</h2>
        </div>
        <span className="record-count">
          {moments.length} moment{moments.length === 1 ? "" : "s"}
        </span>
      </div>

      {moments.length === 0 ? (
        <p className="processing-note" role="status">
          No coaching moments — objections were handled, an alternative and a demo were offered
          where needed, and nothing was flagged for review.
        </p>
      ) : (
        <ul className="coaching-list">
          {moments.map((moment, index) => (
            <li key={index} className={`coaching-item coaching-item--${moment.severity}`}>
              <span className="coaching-cat">{moment.category}</span>
              <span className="coaching-summary">{moment.summary}</span>
              {moment.evidenced ? (
                <span className="record-evidence" title="Backed by transcript evidence">
                  ◦ evidenced
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
