/** A metric-run pointer is present even when a valid run yielded zero observations. */
export function hasPersistedAnalysisResult(metricRunId: string | null) {
  return metricRunId !== null;
}
