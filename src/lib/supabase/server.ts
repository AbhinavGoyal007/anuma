import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnvironment } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.generated";

export async function createClient() {
  const cookieStore = await cookies();
  const environment = getPublicEnvironment();

  return createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies. The proxy refreshes sessions.
          }
        },
      },
    },
  );
}
