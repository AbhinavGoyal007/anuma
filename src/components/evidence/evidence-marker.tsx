type EvidenceMarkerProps = {
  timestamp: string;
};

export function EvidenceMarker({ timestamp }: EvidenceMarkerProps) {
  return (
    <span className="evidence-marker">
      <span aria-hidden="true" className="evidence-marker-dot" />
      <span>{timestamp}</span>
    </span>
  );
}
