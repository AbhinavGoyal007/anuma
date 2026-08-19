import { permanentRedirect } from "next/navigation";

/**
 * Superseded by Customer Demand.
 *
 * Kept as a redirect rather than deleted because the path is in people's history
 * and in links they have already shared. A dead bookmark reads as a broken
 * product; a redirect reads as a rename.
 */
export default function LegacyCustomerIntelligencePage() {
  permanentRedirect("/intelligence/demand");
}
