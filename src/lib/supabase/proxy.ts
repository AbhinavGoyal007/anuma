import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnvironment } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.generated";

/**
 * Routes where a visitor must be allowed to stay anonymous.
 *
 * Signing someone in automatically while they are standing on the sign-in page
 * makes it impossible to sign in as anybody else — including the owner of the
 * real data.
 */
const AUTHENTICATION_ROUTES = [
  "/sign-in",
  "/sign-up",
  "/auth",
  "/forgot-password",
  "/reset-password",
];

/**
 * Whether an anonymous visitor is shown the demo tenant instead of a login form.
 *
 * Off unless both values are configured, so local development and any real
 * deployment keep their login screen. It is switched on for the shared demo,
 * where the point is that somebody opening the link in a private window sees the
 * product rather than a form.
 *
 * What makes this safe is not this function but row-level security. The account
 * it signs in as belongs to one organization — the synthetic one — so every
 * query is scoped there no matter what a page asks for. The tenants holding real
 * recordings of real customers stay unreachable.
 */
function demoCredentials(): { email: string; password: string } | null {
  const email = process.env.DEMO_AUTOLOGIN_EMAIL?.trim();
  const password = process.env.DEMO_AUTOLOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const environment = getPublicEnvironment();

  const supabase = createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    },
  );

  // getClaims verifies the token. Do not trust getSession for protection decisions.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    const demo = demoCredentials();
    const onAuthenticationRoute = AUTHENTICATION_ROUTES.some((route) =>
      request.nextUrl.pathname.startsWith(route),
    );
    if (demo && !onAuthenticationRoute) {
      // Signed in here rather than by redirecting to a demo route, so the
      // visitor keeps the address they typed and a shared deep link still lands
      // where it was meant to. A failure is deliberately silent: the request
      // continues unauthenticated and the ordinary redirect to the login screen
      // happens, which is exactly the behaviour without this block.
      await supabase.auth.signInWithPassword(demo);
    }
  }

  return response;
}
