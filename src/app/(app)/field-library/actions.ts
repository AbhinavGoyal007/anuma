"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { slugifyFieldKey } from "@/modules/field-library/slug";
import { getApplicationContext } from "@/modules/identity/application-context";

/**
 * Administrator edits to the field library.
 *
 * Only the display name and the definition of a canonical field can change; its
 * key is fixed. A canonical field can be disabled but never deleted. Custom
 * fields a business adds are theirs to rename, redefine and remove. Row level
 * security enforces all of this a second time in the database — these guards are
 * the friendly first line, the policies are the real one.
 */

async function requireAdmin() {
  const context = await getApplicationContext();
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");
  if (context.current.membership.role !== "admin") {
    redirect("/field-library?error=Administrator+access+is+required.");
  }
  return context.current;
}

const editSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  definition: z.string().trim().min(2).max(1200),
});

export async function updateFieldDefinition(formData: FormData) {
  const current = await requireAdmin();
  const parsed = editSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    definition: formData.get("definition"),
  });
  if (!parsed.success) redirect("/field-library?error=Check+the+name+and+definition.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("interaction_field_definitions")
    .update({ label: parsed.data.label, definition: parsed.data.definition })
    .eq("organization_id", current.organization.id)
    .eq("id", parsed.data.id);
  if (error) redirect("/field-library?error=The+field+could+not+be+updated.");

  revalidatePath("/field-library");
  redirect("/field-library?saved=field");
}

const toggleSchema = z.object({
  id: z.string().uuid(),
  enabled: z.enum(["true", "false"]),
});

export async function toggleFieldEnabled(formData: FormData) {
  const current = await requireAdmin();
  const parsed = toggleSchema.safeParse({
    id: formData.get("id"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) redirect("/field-library?error=The+field+could+not+be+changed.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("interaction_field_definitions")
    .update({ is_enabled: parsed.data.enabled === "true" })
    .eq("organization_id", current.organization.id)
    .eq("id", parsed.data.id);
  if (error) redirect("/field-library?error=The+field+could+not+be+changed.");

  revalidatePath("/field-library");
  redirect(`/field-library?saved=${parsed.data.enabled === "true" ? "enabled" : "disabled"}`);
}

const createSchema = z.object({
  label: z.string().trim().min(2).max(80),
  definition: z.string().trim().min(2).max(1200),
});

export async function createCustomField(formData: FormData) {
  const current = await requireAdmin();
  const parsed = createSchema.safeParse({
    label: formData.get("label"),
    definition: formData.get("definition"),
  });
  if (!parsed.success) redirect("/field-library?error=Give+the+tag+a+name+and+a+definition.");

  const key = slugifyFieldKey(parsed.data.label);
  if (!key) redirect("/field-library?error=Use+a+tag+name+with+letters.");

  const supabase = await createClient();

  // New custom tags sort after everything, so the standard fields keep their
  // familiar order and additions land at the end of the list.
  const { data: last } = await supabase
    .from("interaction_field_definitions")
    .select("sort_order")
    .eq("organization_id", current.organization.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("interaction_field_definitions").insert({
    organization_id: current.organization.id,
    key,
    label: parsed.data.label,
    definition: parsed.data.definition,
    source_class: "evidence_extracted",
    value_kind: "text",
    cardinality: "multiple",
    requires_evidence: true,
    is_system: false,
    is_enabled: true,
    sort_order: (last?.sort_order ?? 0) + 1,
    created_by_membership_id: current.membership.id,
  });
  if (error) {
    // The unique (organization_id, key) is the common failure: a name that
    // slugs to a key already in use, standard or custom.
    const reason =
      error.code === "23505"
        ? "A+field+with+that+name+already+exists."
        : "The+tag+could+not+be+created.";
    redirect(`/field-library?error=${reason}`);
  }

  revalidatePath("/field-library");
  redirect("/field-library?saved=created");
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteCustomField(formData: FormData) {
  const current = await requireAdmin();
  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/field-library?error=The+tag+could+not+be+removed.");

  const supabase = await createClient();
  // The delete policy already refuses system rows; scoping to is_system = false
  // here makes the intent explicit and the failure quiet rather than a policy
  // error the user would not understand.
  const { error } = await supabase
    .from("interaction_field_definitions")
    .delete()
    .eq("organization_id", current.organization.id)
    .eq("id", parsed.data.id)
    .eq("is_system", false);
  if (error) redirect("/field-library?error=The+tag+could+not+be+removed.");

  revalidatePath("/field-library");
  redirect("/field-library?saved=removed");
}
