"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getApplicationContext } from "@/modules/identity/application-context";
import { CLEAR_MARGIN } from "@/modules/catalogue/confidence";
import {
  proposeCategoryMappings,
  proposeSpokenCategoryMappings,
} from "@/modules/catalogue/category-mapping";
import { z } from "zod";

/**
 * Confirming what a category label means.
 *
 * Nothing here decides anything: the proposal arrives pre-filled and a person
 * either accepts it, picks a different category, or says it is not a category
 * ANUMA covers. That confirmation is what every category rollup then groups by,
 * which is why a similarity score can never reach a dashboard on its own.
 */

const PAGE = "/administration/categories";

async function requireAdmin() {
  const context = await getApplicationContext();
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");
  if (context.current.membership.role !== "admin") {
    redirect(`${PAGE}?error=Administrator+access+is+required.`);
  }
  return context.current;
}

const decisionSchema = z.object({
  id: z.uuid(),
  // Empty is valid: "not relevant" carries no category at all.
  key: z.string().trim().max(50).nullable(),
  intent: z.enum(["confirm", "not_relevant"]),
});

function readDecision(formData: FormData) {
  const rawKey = formData.get("anuma_category_key");
  return decisionSchema.safeParse({
    id: formData.get("id"),
    key: typeof rawKey === "string" && rawKey.length > 0 ? rawKey : null,
    intent: formData.get("intent"),
  });
}

/**
 * The stored decision.
 *
 * Accepting without a category selected is rejected rather than saved as a
 * confirmed null — a confirmed mapping to nothing is indistinguishable from
 * "not relevant" in the data but means something entirely different to whoever
 * reads it next.
 */
function decisionColumns(
  parsed: { key: string | null; intent: "confirm" | "not_relevant" },
  membershipId: string,
) {
  if (parsed.intent === "not_relevant") {
    return {
      status: "not_relevant" as const,
      anuma_category_key: null,
      confirmed_by_membership_id: membershipId,
    };
  }
  return {
    status: "confirmed" as const,
    anuma_category_key: parsed.key,
    confirmed_by_membership_id: membershipId,
  };
}

function revalidate() {
  revalidatePath(PAGE);
  revalidatePath("/customer-intelligence");
}

export async function confirmLabelMapping(formData: FormData) {
  const current = await requireAdmin();
  const parsed = readDecision(formData);
  if (!parsed.success) redirect(`${PAGE}?error=That+decision+could+not+be+read.`);
  if (parsed.data.intent === "confirm" && parsed.data.key === null) {
    redirect(`${PAGE}?error=Choose+a+category+before+accepting.`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("category_mappings")
    .update(decisionColumns(parsed.data, current.membership.id))
    .eq("id", parsed.data.id)
    .eq("organization_id", current.organization.id);
  if (error) redirect(`${PAGE}?error=The+mapping+could+not+be+saved.`);

  revalidate();
  redirect(`${PAGE}?saved=label`);
}

export async function confirmPhraseMapping(formData: FormData) {
  const current = await requireAdmin();
  const parsed = readDecision(formData);
  if (!parsed.success) redirect(`${PAGE}?error=That+decision+could+not+be+read.`);
  if (parsed.data.intent === "confirm" && parsed.data.key === null) {
    redirect(`${PAGE}?error=Choose+a+category+before+accepting.`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("spoken_category_mappings")
    .update(decisionColumns(parsed.data, current.membership.id))
    .eq("id", parsed.data.id)
    .eq("organization_id", current.organization.id);
  if (error) redirect(`${PAGE}?error=The+mapping+could+not+be+saved.`);

  revalidate();
  redirect(`${PAGE}?saved=phrase`);
}

/**
 * Confirms every waiting proposal the model was not in two minds about.
 *
 * Only rows whose best category beat the runner-up by a clear margin are
 * included; the rest stay in the queue for a person, which is where the two
 * accessory labels that this catalogue gets wrong end up. The alternative —
 * three hundred and seventy-two individual Accepts — is not review, because
 * nobody reads to the end of it.
 */
export async function confirmClearProposals(formData: FormData) {
  const current = await requireAdmin();
  const queue = formData.get("queue");
  if (queue !== "labels" && queue !== "phrases") {
    redirect(`${PAGE}?error=That+queue+is+not+recognised.`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    queue === "labels" ? "confirm_clear_category_mappings" : "confirm_clear_spoken_mappings",
    {
      p_organization_id: current.organization.id,
      p_min_margin: CLEAR_MARGIN,
      p_membership_id: current.membership.id,
    },
  );
  if (error) redirect(`${PAGE}?error=Those+mappings+could+not+be+confirmed.`);

  revalidate();
  redirect(`${PAGE}?confirmed=${data ?? 0}`);
}

/**
 * Queues anything new for confirmation.
 *
 * Existing rows are left exactly as they are, so a re-run never disturbs a
 * decision someone already made — it only ever adds labels that appeared since.
 */
export async function refreshCategoryProposals() {
  const current = await requireAdmin();

  // Nothing that redirects may sit inside the try: `redirect` unwinds by
  // throwing, and catching it here would turn every success into the failure
  // message.
  let queued: number;
  try {
    const [labels, phrases] = await Promise.all([
      proposeCategoryMappings(current.organization.id),
      proposeSpokenCategoryMappings(current.organization.id),
    ]);
    queued = labels.proposed + phrases.proposed;
  } catch {
    redirect(`${PAGE}?error=Proposals+could+not+be+prepared+right+now.`);
  }

  revalidate();
  redirect(`${PAGE}?proposed=${queued}`);
}
