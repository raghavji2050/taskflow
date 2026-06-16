import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { DashboardClient } from "@/components/DashboardClient";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "List",
  "View and manage your tasks in a sortable list."
);

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <DashboardClient userName={session.user.name ?? "there"} />
    </div>
  );
}
