import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TimeReportsClient } from "@/components/reports/TimeReportsClient";

export default async function TimeReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <TimeReportsClient />;
}
