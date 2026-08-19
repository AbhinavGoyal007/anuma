import { permanentRedirect } from "next/navigation";

/** Superseded by the Decision Journey, which carries the outcome axes. */
export default function LegacyOutcomeIntelligencePage() {
  permanentRedirect("/intelligence/journey");
}
