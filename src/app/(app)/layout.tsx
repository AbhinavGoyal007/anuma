import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { switchOrganization } from "@/app/(app)/actions";
import { AppShell } from "@/components/shell/app-shell";
import { getApplicationContext } from "@/modules/identity/application-context";

export default async function ApplicationLayout({ children }: Readonly<{ children: ReactNode }>) {
  const context = await getApplicationContext();

  if (!context) {
    redirect("/sign-in");
  }

  if (!context.current) redirect("/setup");
  const shellContext = {
    userEmail: context.user.email,
    assignmentCount: context.current.assignments.length,
    currentOrganization: {
      id: context.current.organization.id,
      name: context.current.organization.name,
      role: context.current.membership.role,
    },
    organizations: context.organizations,
  };

  return (
    <AppShell context={shellContext} switchOrganization={switchOrganization}>
      {children}
    </AppShell>
  );
}
