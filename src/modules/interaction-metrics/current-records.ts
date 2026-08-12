import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The current interaction record for each conversation in a window.
 *
 * A conversation can be re-extracted, leaving several records behind it, so any
 * aggregate has to pick one per conversation or it counts the same interaction
 * twice. The most recently completed record is the current one — the same rule
 * the demand dashboard uses.
 *
 * Read through the cookie client so row level security scopes the result to what
 * the viewer may see.
 */
export async function currentRecordIdsSince(
  organizationId: string,
  since: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("interaction_records")
    .select("id, conversation_id, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const current = new Map<string, string>();
  for (const row of data ?? []) {
    if (!current.has(row.conversation_id)) current.set(row.conversation_id, row.id);
  }
  return [...current.values()];
}
