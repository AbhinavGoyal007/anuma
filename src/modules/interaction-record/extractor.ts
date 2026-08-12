import "server-only";

import OpenAI from "openai";

import { getOpenAIEnvironment } from "@/lib/env";
import {
  buildExtractionJsonSchema,
  buildExtractionSystemPrompt,
  extractionSchema,
  normalizeLabel,
  type ExtractedValue,
  type ExtractionField,
} from "@/modules/interaction-record/extraction-contract";
import { groundValues, type GroundingResult } from "@/modules/interaction-record/grounding";

/**
 * Produces a Commercial Interaction Record from a diarised transcript.
 *
 * Two stages, deliberately separated: the model reads the conversation, then
 * code checks that everything it claimed is traceable to a real segment. The
 * schema constrains the shape of the reply and nothing more — a well-formed
 * budget for a conversation that never mentioned money is exactly the failure
 * this second stage exists to catch.
 */

export type RecordSegment = {
  id: string;
  role: string;
  startMilliseconds: number;
  text: string;
};

export type ExtractionResult = {
  grounded: GroundingResult;
  inputTokens: number | null;
  outputTokens: number | null;
  requestId: string | null;
};

/**
 * Segments are numbered rather than passed by UUID.
 *
 * A UUID costs roughly fifteen tokens and appears twice — once in the prompt and
 * again in every citation. Short indices cut the input materially and, more
 * usefully, make a fabricated citation obvious instead of plausible.
 */
function renderTranscript(segments: readonly RecordSegment[]): string {
  return segments
    .map((segment, index) => {
      const at = Math.round(segment.startMilliseconds / 1000);
      return `[s${index + 1}] (${at}s) ${segment.role}: ${segment.text}`;
    })
    .join("\n");
}

export async function extractInteractionRecord(input: {
  vertical: string;
  country: string;
  currency: string;
  segments: readonly RecordSegment[];
  /** The organization's enabled field set — what the model is asked to produce. */
  fields: readonly ExtractionField[];
}): Promise<ExtractionResult> {
  if (input.fields.length === 0) {
    // An empty schema enum is not a valid strict structured output, and a record
    // with no fields is not a record. Surface it rather than call the provider.
    throw new Error("No fields are enabled for extraction.");
  }

  const environment = getOpenAIEnvironment();
  const client = new OpenAI({ apiKey: environment.OPENAI_API_KEY });

  const indexToId = new Map(input.segments.map((segment, index) => [`s${index + 1}`, segment.id]));

  const response = await client.responses.create({
    model: environment.ANUMA_ANALYSIS_MODEL,
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "commercial_interaction_record",
        strict: true,
        schema: buildExtractionJsonSchema(input.fields),
      },
    },
    input: [
      { role: "system", content: buildExtractionSystemPrompt(input.fields) },
      {
        role: "user",
        content: `VERTICAL: ${input.vertical}\nCOUNTRY: ${input.country}\nCURRENCY: ${input.currency}\n\nTRANSCRIPT (cite segments by their bracketed label):\n${renderTranscript(input.segments)}`,
      },
    ],
  });

  const parsed = extractionSchema.parse(JSON.parse(response.output_text));

  // Citations come back as labels; they are resolved to real segment ids here.
  // An unresolvable label stays as it is so grounding rejects it rather than
  // this step quietly dropping the evidence and letting the value through.
  const values = parsed.values.map(
    (value) =>
      ({
        ...value,
        label: normalizeLabel(value.label),
        evidenceSegmentIds: value.evidenceSegmentIds.map((label) => indexToId.get(label) ?? label),
      }) as ExtractedValue,
  );

  return {
    grounded: groundValues(
      values,
      new Set(input.segments.map((segment) => segment.id)),
      input.fields,
    ),
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    requestId: response.id,
  };
}
