import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnvironment } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.generated";

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
  await supabase.auth.getClaims();

  return response;
}
