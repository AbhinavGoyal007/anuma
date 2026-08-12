"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getApplicationContext,
  organizationCookieName,
} from "@/modules/identity/application-context";

const organizationSelectionSchema = z.string().uuid();

export async function switchOrganization(formData: FormData) {
  const organizationId = organizationSelectionSchema.safeParse(formData.get("organization_id"));
  const context = await getApplicationContext();

  if (!organizationId.success || !context) redirect("/sign-in");
  if (!context.organizations.some((organization) => organization.id === organizationId.data)) {
    redirect("/conversations?error=Organization+access+was+not+available.");
  }

  const cookieStore = await cookies();
  cookieStore.set(organizationCookieName, organizationId.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/", "layout");
  redirect("/conversations");
}
