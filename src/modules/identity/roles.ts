import type { Database } from "@/lib/supabase/database.generated";

export type MembershipRole = Database["public"]["Enums"]["membership_role"];

export function roleLabel(role: MembershipRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
