type Metric = { key: string; unit: string; value: number };

function duration(milliseconds: number) {
  const totalSeconds = Math.round(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function ratio(value: number) {
  return `${Math.round(value * 100)}%`;
}

function metricValue(metrics: Map<string, Metric>, key: string) {
  return metrics.get(key)?.value ?? null;
}

export function InteractionMetrics({ metrics }: { metrics: Metric[] }) {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const interactionDuration = metricValue(byKey, "interaction_duration");
  if (interactionDuration === null) return null;

  const representativeShare = metricValue(byKey, "representative_talk_share");
  const customerShare = metricValue(byKey, "customer_talk_share");
  const representativeDuration = metricValue(byKey, "representative_talk_duration");
  const customerDuration = metricValue(byKey, "customer_talk_duration");
  const representativeWpm = metricValue(byKey, "representative_words_per_minute");
  const customerWpm = metricValue(byKey, "customer_words_per_minute");
  const representativeMonologue = metricValue(byKey, "representative_longest_monologue");
  const customerMonologue = metricValue(byKey, "customer_longest_monologue");
  const representativeTurns = metricValue(byKey, "representative_turn_count");
  const customerTurns = metricValue(byKey, "customer_turn_count");

  return (
    <section className="interaction-metrics" aria-labelledby="interaction-metrics-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Conversation</p>
          <h2 id="interaction-metrics-title">Talk balance and pace</h2>
        </div>
        <strong className="metric-duration">{duration(interactionDuration)}</strong>
      </div>
      <dl className="metric-grid">
        {representativeShare !== null && customerShare !== null ? (
          <div>
            <dt>Talk balance</dt>
            <dd>
              Representative {ratio(representativeShare)} · Customer {ratio(customerShare)}
            </dd>
          </div>
        ) : null}
        {representativeDuration !== null || customerDuration !== null ? (
          <div>
            <dt>Speaking time</dt>
            <dd>
              Rep {duration(representativeDuration ?? 0)} · Customer{" "}
              {duration(customerDuration ?? 0)}
            </dd>
          </div>
        ) : null}
        {representativeWpm !== null || customerWpm !== null ? (
          <div>
            <dt>Estimated WPM</dt>
            <dd>
              Rep {representativeWpm === null ? "—" : Math.round(representativeWpm)} · Customer{" "}
              {customerWpm === null ? "—" : Math.round(customerWpm)}
            </dd>
          </div>
        ) : null}
        {representativeMonologue !== null || customerMonologue !== null ? (
          <div>
            <dt>Longest monologue</dt>
            <dd>
              Rep {duration(representativeMonologue ?? 0)} · Customer{" "}
              {duration(customerMonologue ?? 0)}
            </dd>
          </div>
        ) : null}
        {representativeTurns !== null || customerTurns !== null ? (
          <div>
            <dt>Turns</dt>
            <dd>
              Rep {representativeTurns ?? 0} · Customer {customerTurns ?? 0}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="metric-note">
        Duration and turn metrics are deterministic from the mapped transcript. WPM is estimated
        from whitespace tokens and is not a language-quality judgment.
      </p>
    </section>
  );
}
