import { buildInteractionRecord } from "@/modules/interaction-record/persistence";

/**
 * Builds the Commercial Interaction Record for a conversation, durably.
 *
 * Kicked off the moment a speaker mapping is confirmed, because that is the
 * first point at which every value can be attributed to the right person. The
 * build step closes the record out on failure itself, so this wrapper only has
 * to keep the run alive across a transient fault.
 */
export async function buildInteractionRecordWorkflow(conversationId: string) {
  "use workflow";
  return buildInteractionRecord(conversationId);
}
