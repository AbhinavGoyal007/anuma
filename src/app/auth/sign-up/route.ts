import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

function redirectWithMessage(request: NextRequest, key: "error" | "message", value: string) {
  const destination = getSiteUrl(request, "/sign-up");
  destination.searchParams.set(key, value);
  return NextResponse.redirect(destination, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 8) {
    return redirectWithMessage(
      request,
      "error",
      "Enter a valid email and a password with at least 8 characters.",
    );
  }

  const supabase = await createClient();
  const callback = getSiteUrl(request, "/auth/callback");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callback.toString(),
    },
  });

  if (error) {
    return redirectWithMessage(
      request,
      "error",
      "We could not create your account. If you already registered, sign in or reset your password.",
    );
  }

  if (!data.session) {
    return redirectWithMessage(
      request,
      "message",
      "Check your email to confirm your account. If you already registered, use Sign in or Forgot password instead.",
    );
  }

  return NextResponse.redirect(getSiteUrl(request, "/setup"), { status: 303 });
}
