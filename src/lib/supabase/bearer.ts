import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getPublicEnvironment } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.generated";

/**
 * Supabase client for a caller that carries a bearer token instead of cookies.
 *
 * Native clients have no cookie jar, so `@supabase/ssr` cannot authenticate
 * them. This is the same publishable key the browser uses and the request still
 * runs as the signed-in member, so RLS applies exactly as it does on the web.
 * It is not an admin client and must never be substituted for one.
 */
export function createBearerClient(accessToken: string) {
  const environment = getPublicEnvironment();

  return createSupabaseClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

/** The bearer token on a request, or null when the header is absent or malformed. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}
