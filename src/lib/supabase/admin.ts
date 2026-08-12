import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getTrustedServerEnvironment } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.generated";

/**
 * Processing-only Supabase client. It bypasses RLS, so callers must load and
 * validate every organization/conversation/recording relationship themselves.
 */
export function createAdminClient() {
  const environment = getTrustedServerEnvironment();

  return createClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
