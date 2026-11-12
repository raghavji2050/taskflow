import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuditLogClient } from "@/components/audit/AuditLogClient";

export default async function ActivityPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <AuditLogClient />;
}
