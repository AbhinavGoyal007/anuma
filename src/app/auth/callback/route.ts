import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/setup";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(getSiteUrl(request, next), { status: 303 });
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(getSiteUrl(request, next), { status: 303 });
  }

  const destination = getSiteUrl(request, "/sign-in");
  destination.searchParams.set(
    "error",
    "This authentication link is invalid or has expired. Please try again.",
  );
  return NextResponse.redirect(destination, { status: 303 });
}
