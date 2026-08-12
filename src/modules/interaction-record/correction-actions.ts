"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getApplicationContext } from "@/modules/identity/application-context";

/**
 * Correcting an extracted fact.
 *
 * A correction never mutates the AI value — it appends a person's override,
 * preserving the original and the full history. Only managers and admins may
 * correct, enforced both here and by the table's insert policy. The pipeline is
 * untouched: this is an optional overlay a person applies when they choose to.
 */

async function requireCorrector(conversationId: string) {
  const context = await getApplicationContext();
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");
  const role = context.current.membership.role;
  if (role !== "admin" && role !== "manager") {
    redirect(`/conversations/${conversationId}?error=Only+a+manager+or+admin+can+correct+a+fact.`);
  }
  return context.current;
}

/**
 * Appends a correction to a specific extracted value.
 *
 * The value is loaded first so the record, field and organization come from the
 * value itself, not from the form — a caller cannot attach a correction to a
 * value they cannot see, because row level security scopes this read.
 */
async function appendCorrection(
  membershipId: string,
  valueId: string,
  conversationId: string,
  fields: { correctedText: string | null; isRejected: boolean; note: string | null },
) {
  const supabase = await createClient();
  const { data: value } = await supabase
    .from("interaction_field_values")
    .select("id, organization_id, conversation_id, interaction_record_id, field_key")
    .eq("id", valueId)
    .maybeSingle();
  if (!value || value.conversation_id !== conversationId) {
    redirect(`/conversations/${conversationId}?error=That+value+could+not+be+found.`);
  }

  const { error } = await supabase.from("interaction_field_value_corrections").insert({
    organization_id: value.organization_id,
    conversation_id: value.conversation_id,
    interaction_record_id: value.interaction_record_id,
    field_value_id: value.id,
    field_key: value.field_key,
    corrected_text: fields.correctedText,
    is_rejected: fields.isRejected,
    note: fields.note,
    created_by_membership_id: membershipId,
  });
  if (error) {
    redirect(`/conversations/${conversationId}?error=The+correction+could+not+be+saved.`);
  }

  revalidatePath(`/conversations/${conversationId}`);
  redirect(`/conversations/${conversationId}?corrected=1`);
}

const correctSchema = z.object({
  valueId: z.string().uuid(),
  conversationId: z.string().uuid(),
  correctedText: z.string().trim().min(1).max(400),
  note: z.string().trim().max(500).optional(),
});

export async function correctFieldValue(formData: FormData) {
  const conversationId = String(formData.get("conversationId") ?? "");
  const current = await requireCorrector(conversationId);
  const parsed = correctSchema.safeParse({
    valueId: formData.get("valueId"),
    conversationId: formData.get("conversationId"),
    correctedText: formData.get("correctedText"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    redirect(`/conversations/${conversationId}?error=Enter+the+correct+value.`);
  }
  await appendCorrection(current.membership.id, parsed.data.valueId, parsed.data.conversationId, {
    correctedText: parsed.data.correctedText,
    isRejected: false,
    note: parsed.data.note ?? null,
  });
}

const rejectSchema = z.object({
  valueId: z.string().uuid(),
  conversationId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

export async function rejectFieldValue(formData: FormData) {
  const conversationId = String(formData.get("conversationId") ?? "");
  const current = await requireCorrector(conversationId);
  const parsed = rejectSchema.safeParse({
    valueId: formData.get("valueId"),
    conversationId: formData.get("conversationId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    redirect(`/conversations/${conversationId}?error=That+value+could+not+be+marked+wrong.`);
  }
  await appendCorrection(current.membership.id, parsed.data.valueId, parsed.data.conversationId, {
    correctedText: null,
    isRejected: true,
    note: parsed.data.note ?? null,
  });
}
