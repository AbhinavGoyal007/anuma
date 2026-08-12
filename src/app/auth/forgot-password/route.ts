import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

function redirectWithMessage(request: NextRequest, key: "error" | "message", value: string) {
  const destination = getSiteUrl(request, "/forgot-password");
  destination.searchParams.set(key, value);
  return NextResponse.redirect(destination, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return redirectWithMessage(request, "error", "Enter your account email.");
  }

  const supabase = await createClient();
  const callback = getSiteUrl(request, "/auth/recovery");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callback.toString(),
  });

  if (error) {
    return redirectWithMessage(
      request,
      "error",
      "We could not send the reset email right now. Please try again shortly.",
    );
  }

  return redirectWithMessage(
    request,
    "message",
    "If an ANUMA account exists for this email, a password reset link has been sent.",
  );
}
