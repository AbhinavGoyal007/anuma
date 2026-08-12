import type { AmountScale } from "@/modules/analysis/amount-scale";

export type AnalysisInputSegment = {
  id: string;
  speaker: string;
  startMilliseconds: number;
  endMilliseconds: number;
  text: string;
};
export type ExtractedObservation = {
  type: ObservationType;
  key: string;
  text: string | null;
  amountMajor: number | null;
  /** The scale word the speaker used, applied in code rather than by the model. */
  amountScale: AmountScale | null;
  currency: string | null;
  attributes: Record<string, unknown>;
  evidenceSegmentIds: string[];
};

export const observationTypes = [
  "need",
  "budget",
  "product",
  "spec",
  "price",
  "competitor",
  "competitor_price",
  "store_quote",
  "question",
  "objection",
  "barrier",
  "decision_driver",
  "commitment",
  "next_action",
  "finance",
] as const;

export type ObservationType = (typeof observationTypes)[number];

export interface AnalysisProvider {
  extract(input: {
    vertical: string;
    country: string;
    currency: string;
    segments: AnalysisInputSegment[];
  }): Promise<{
    observations: ExtractedObservation[];
    requestId: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
  }>;
}
