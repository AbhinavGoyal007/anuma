/**
 * How long to wait between checks on a submitted Sarvam job.
 *
 * Every poll is a workflow step, and every step is three persisted events, so
 * this curve is what a slow or stalled job costs rather than a timing
 * preference. A fixed short interval spends money watching a job that cannot
 * possibly be ready yet.
 *
 * Backing off keeps the same three-hour window in roughly half the polls, and
 * the short early waits return a finished short recording sooner than the
 * previous fixed fifteen seconds did.
 *
 * Kept free of server-only imports so the schedule can be tested directly.
 */

const POLL_BACKOFF_MS = [5_000, 10_000, 20_000] as const;
const POLL_CEILING_MS = 30_000;

/** Three hours at the ceiling interval, matching the previous timeout. */
export const MAX_POLL_ATTEMPTS = 365;

/** Delay before poll number `attempt` (0-based). */
export function pollDelayMs(attempt: number): number {
  return POLL_BACKOFF_MS[attempt] ?? POLL_CEILING_MS;
}
