"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getApplicationContext,
  organizationCookieName,
} from "@/modules/identity/application-context";
import { organizationSetupSchema } from "@/modules/organizations/validation";

export async function setupOrganization(formData: FormData) {
  const context = await getApplicationContext();
  if (!context) redirect("/sign-in");
  if (context.current) redirect("/conversations");

  const input = organizationSetupSchema.safeParse({
    name: formData.get("name"),
    countryCode: formData.get("country_code"),
    defaultCurrency: formData.get("default_currency"),
    timezone: formData.get("timezone"),
  });

  if (!input.success) {
    redirect("/setup?error=Check+the+organization+details+and+try+again.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bootstrap_organization", {
    p_name: input.data.name,
    p_country_code: input.data.countryCode,
    p_default_currency: input.data.defaultCurrency,
    p_timezone: input.data.timezone,
  });

  if (error || !data[0]) {
    redirect("/setup?error=The+organization+could+not+be+created.");
  }

  const cookieStore = await cookies();
  cookieStore.set(organizationCookieName, data[0].organization_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/administration?created=organization");
}
