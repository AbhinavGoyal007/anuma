import { redirect } from "next/navigation";

import { getApplicationContext } from "@/modules/identity/application-context";

export default async function Home() {
  const context = await getApplicationContext();
  if (!context) redirect("/sign-in");
  redirect(context.current ? "/conversations" : "/setup");
}
