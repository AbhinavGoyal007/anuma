import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { getOpenAIEnvironment } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.generated";
import {
  heuristicRepresentative,
  resolveSpeaker,
  speakerStats,
  type SpeakerTurn,
} from "@/modules/speaker-mapping/heuristics";

/**
 * Decides which diarized speaker is the representative, automatically.
 *
 * The model reads the conversation and names the representative; the heuristics
 * name one independently from behaviour alone. When they agree the mapping is
 * committed with high confidence; when they disagree the model is trusted but
 * the confidence is lowered, so the decision is always made and no conversation
 * ever waits for a human. The confidence travels with the mapping for anything
 * downstream that wants to weight or audit it.
 */

const MODEL = "gpt-5.6-luna";

const proposalSchema = z.object({
  representativeSpeaker: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(300),
});

const proposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["representativeSpeaker", "confidence", "reasoning"],
  properties: {
    representativeSpeaker: { type: ["string", "null"] },
    confidence: { type: "number" },
    reasoning: { type: "string" },
  },
} as const;

const SYSTEM_PROMPT = `You identify the sales representative in a diarized retail conversation.

Each line is labelled with an opaque speaker id. Decide which speaker is the store's representative and which are customers. The representative greets the customer, introduces themselves or their company, asks the discovery questions, quotes prices, recommends products and drives the conversation. Customers state needs, budgets and objections and ask about price and availability.

Do not assume any particular speaker id is the representative — judge only from what each speaker says.

Return the speaker id of the representative in representativeSpeaker, a confidence from 0 to 1, and one short sentence of reasoning citing what gave it away. If you genuinely cannot tell, set representativeSpeaker to null with a low confidence.`;

export type AutoMapResult = {
  mappingVersionId: string | null;
  representative: string | null;
  confidence: number;
  agreed: boolean;
  reason: string;
};

function renderForRoleId(turns: readonly SpeakerTurn[], speakers: readonly string[]): string {
  // The speaker id is rendered bare, with the exact set listed up front, so the
  // model returns one of these tokens verbatim rather than echoing punctuation
  // from the formatting — a stray bracket makes the answer match no real
  // speaker and silently corrupts the mapping.
  const lines = [...turns]
    .sort((a, b) => a.sequence - b.sequence)
    .map((turn) => `${turn.speaker}: ${turn.text}`)
    .join("\n");
  return `SPEAKER IDS: ${speakers.join(", ")}\n\n${lines}`;
}

async function proposeRepresentative(
  turns: readonly SpeakerTurn[],
  speakers: readonly string[],
): Promise<z.infer<typeof proposalSchema>> {
  const client = new OpenAI({ apiKey: getOpenAIEnvironment().OPENAI_API_KEY });
  const response = await client.responses.create({
    model: MODEL,
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "representative_identification",
        strict: true,
        schema: proposalJsonSchema,
      },
    },
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: renderForRoleId(turns, speakers) },
    ],
  });
  const parsed = proposalSchema.parse(JSON.parse(response.output_text));
  return {
    ...parsed,
    representativeSpeaker: resolveSpeaker(parsed.representativeSpeaker, speakers),
  };
}

/**
 * Turns a single representative choice into a role for every speaker.
 *
 * The representative is the chosen one; among the rest the speaker who talks
 * most is the primary customer and any others are additional customers. That
 * keeps a three-way family conversation from losing its second and third
 * voices, while still producing exactly one representative and one customer for
 * the common two-person case.
 */
function assignRoles(
  turns: readonly SpeakerTurn[],
  representative: string | null,
): { providerSpeakerIdentifier: string; participantRole: string }[] {
  const stats = speakerStats(turns).sort((a, b) => b.words - a.words);
  const others = stats.filter((s) => s.speaker !== representative);

  return stats.map((s) => {
    if (s.speaker === representative) {
      return { providerSpeakerIdentifier: s.speaker, participantRole: "representative" };
    }
    const isPrimaryCustomer = others.length > 0 && others[0]!.speaker === s.speaker;
    return {
      providerSpeakerIdentifier: s.speaker,
      participantRole: isPrimaryCustomer ? "customer" : "additional_customer",
    };
  });
}

export async function autoMapSpeakers(transcriptionRunId: string): Promise<AutoMapResult> {
  const db = createAdminClient();

  const { data: segments, error } = await db
    .from("transcript_segments")
    .select("provider_speaker_identifier, original_text, sequence_number")
    .eq("transcription_run_id", transcriptionRunId)
    .order("sequence_number");
  if (error) throw new Error(`Transcript could not be read for mapping: ${error.message}`);

  const turns: SpeakerTurn[] = (segments ?? [])
    .filter((s) => s.provider_speaker_identifier)
    .map((s) => ({
      speaker: s.provider_speaker_identifier as string,
      text: s.original_text,
      sequence: s.sequence_number,
    }));

  const speakers = [...new Set(turns.map((t) => t.speaker))];
  if (speakers.length === 0) {
    return {
      mappingVersionId: null,
      representative: null,
      confidence: 0,
      agreed: false,
      reason: "No diarized speakers to map.",
    };
  }

  // A single-speaker transcript cannot be a two-party sale; map the one voice as
  // the representative at low confidence rather than inventing a customer.
  if (speakers.length === 1) {
    const entries = [
      { providerSpeakerIdentifier: speakers[0]!, participantRole: "representative" },
    ];
    const mappingVersionId = await commit(transcriptionRunId, entries, 0.3, "single_speaker");
    return {
      mappingVersionId,
      representative: speakers[0]!,
      confidence: 0.3,
      agreed: false,
      reason: "single_speaker",
    };
  }

  const heuristic = heuristicRepresentative(turns);
  const proposal = await proposeRepresentative(turns, speakers);

  // The model is the primary signal; the heuristics corroborate it. Agreement
  // lifts confidence to at least high; disagreement keeps the model's pick but
  // caps confidence so the record reads as less certain.
  const modelPick = proposal.representativeSpeaker;
  const representative = modelPick ?? heuristic.representative;
  const agreed = modelPick !== null && modelPick === heuristic.representative;

  let confidence: number;
  if (agreed) {
    confidence = Math.max(0.9, proposal.confidence);
  } else if (modelPick !== null) {
    confidence = Math.min(0.7, proposal.confidence);
  } else {
    // Model abstained; lean on the heuristics but say so with low confidence.
    confidence = Math.min(0.5, 0.2 + heuristic.margin);
  }

  const entries = assignRoles(turns, representative);
  const reason = `auto: rep=${representative ?? "?"} model=${modelPick ?? "none"} heuristic=${heuristic.representative ?? "none"} ${agreed ? "agree" : "disagree"}; ${proposal.reasoning}`;

  const mappingVersionId = await commit(transcriptionRunId, entries, confidence, reason);
  return { mappingVersionId, representative, confidence, agreed, reason };
}

async function commit(
  transcriptionRunId: string,
  entries: { providerSpeakerIdentifier: string; participantRole: string }[],
  confidence: number,
  reason: string,
): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("create_automatic_speaker_mapping", {
    p_transcription_run_id: transcriptionRunId,
    p_entries: entries as unknown as Json,
    p_confidence: confidence,
    p_reason: reason.slice(0, 500),
  });
  if (error || !data) {
    throw new Error(`Automatic speaker mapping could not be saved: ${error?.message}`);
  }
  return data;
}
