import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { getOpenAIEnvironment } from "@/lib/env";

/**
 * A short, human-readable recap of an interaction.
 *
 * Generated from the record's own validated facts — never the raw transcript —
 * so the narrative cannot claim anything the extraction did not support. It is
 * qualitative prose, not a metric, which is why an LLM may write it directly;
 * the numbers a dashboard shows still come only from code. Best-effort: a record
 * is valuable without a summary, so a failure here never fails the record.
 */

export type SummaryFact = { label: string; value: string };

const summarySchema = z.object({ summary: z.string().min(1).max(2000) });

const summaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: { summary: { type: "string" } },
} as const;

export const SUMMARY_SYSTEM_PROMPT = `You write a short recap of a retail sales interaction for a manager scanning many of them.

You are given only the structured facts already extracted from the conversation. Use nothing else: do not invent products, prices, numbers, reasons or outcomes that are not in the facts. If a fact is absent, leave it out — never guess.

Write two to four plain sentences that follow the arc of the interaction: who the customer was and what they came for, what they were shown or recommended, what friction came up (price, stock, competitor, finance, weight), and how it ended. Keep numbers exactly as given.

Be neutral and factual. This is an intelligence recap, not a sales pitch and not coaching — do not praise or criticise the representative, and do not add advice. No preamble, no bullet points, no headings; just the recap.`;

/** The facts as the model sees them: one "label: value" line each. */
export function renderFactsDigest(facts: readonly SummaryFact[]): string {
  return facts.map((fact) => `- ${fact.label}: ${fact.value}`).join("\n");
}

export type SummaryResult = {
  summary: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function generateInteractionSummary(input: {
  facts: readonly SummaryFact[];
  vertical: string;
  country: string;
  currency: string;
}): Promise<SummaryResult | null> {
  // Nothing was extracted worth narrating — no call, no summary.
  if (input.facts.length === 0) return null;

  const environment = getOpenAIEnvironment();
  const client = new OpenAI({ apiKey: environment.OPENAI_API_KEY });

  const response = await client.responses.create({
    model: environment.ANUMA_ANALYSIS_MODEL,
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "interaction_summary",
        strict: true,
        schema: summaryJsonSchema,
      },
    },
    input: [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      {
        role: "user",
        content: `VERTICAL: ${input.vertical}\nCOUNTRY: ${input.country}\nCURRENCY: ${input.currency}\n\nFACTS:\n${renderFactsDigest(input.facts)}`,
      },
    ],
  });

  const parsed = summarySchema.parse(JSON.parse(response.output_text));
  return {
    summary: parsed.summary.trim(),
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}
