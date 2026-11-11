import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InsightsClient } from "@/components/reports/InsightsClient";

export default async function InsightsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <InsightsClient />;
}
