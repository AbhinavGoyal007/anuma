type EmptyStateProps = {
  description: string;
  signal: "evidence" | "customer" | "performance" | "outcome" | "administration";
};

const signalLabels: Record<EmptyStateProps["signal"], string> = {
  evidence: "Evidence foundation",
  customer: "Structured intelligence foundation",
  performance: "Measurement foundation",
  outcome: "Learning will begin here",
  administration: "Configuration foundation",
};

export function EmptyState({ description, signal }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-label={signalLabels[signal]}>
      <div className={`empty-state-mark empty-state-mark-${signal}`} aria-hidden="true">
        <span />
      </div>
      <div>
        <p className="empty-state-label">{signalLabels[signal]}</p>
        <p className="empty-state-copy">{description}</p>
      </div>
    </section>
  );
}
