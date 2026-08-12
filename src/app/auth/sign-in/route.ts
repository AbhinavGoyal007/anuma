import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

function redirectWithMessage(request: NextRequest, key: "error" | "message", value: string) {
  const destination = getSiteUrl(request, "/sign-in");
  destination.searchParams.set(key, value);
  return NextResponse.redirect(destination, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return redirectWithMessage(request, "error", "Enter your email and password.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return redirectWithMessage(
      request,
      "error",
      "We could not sign you in. Check your password or use Forgot password.",
    );
  }

  return NextResponse.redirect(getSiteUrl(request, "/"), { status: 303 });
}
