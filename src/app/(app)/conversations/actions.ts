"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { conversationSetupSchema } from "@/modules/conversations/validation";
import { getApplicationContext } from "@/modules/identity/application-context";

export async function createConversation(formData: FormData) {
  const context = await getApplicationContext();
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const input = conversationSetupSchema.safeParse({
    title: formData.get("title") || undefined,
    vertical: formData.get("vertical"),
    locationId: formData.get("location_id") || "",
    teamId: formData.get("team_id") || "",
    consentStatus: formData.get("consent_status"),
    consentCaptureMethod: formData.get("consent_capture_method"),
  });
  if (!input.success) redirect("/conversations?error=Check+the+conversation+details.");

  const supabase = await createClient();
  const { data: conversationId, error } = await supabase.rpc("create_conversation_with_consent", {
    p_organization_id: context.current.organization.id,
    p_vertical: input.data.vertical,
    p_started_at: new Date().toISOString(),
    p_location_id: input.data.locationId ?? undefined,
    p_team_id: input.data.teamId ?? undefined,
    p_title: input.data.title || undefined,
    p_consent_status: input.data.consentStatus,
    p_consent_capture_method: input.data.consentCaptureMethod,
  });

  if (error) {
    redirect("/conversations?error=The+conversation+could+not+be+created+for+this+scope.");
  }

  if (!conversationId) redirect("/conversations?error=The+interaction+could+not+be+created.");
  revalidatePath("/conversations");
  redirect(`/conversations/${conversationId}`);
}
