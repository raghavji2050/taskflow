import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocsClient } from "@/components/docs/DocsClient";

export default async function DocsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6">
      <DocsClient />
    </div>
  );
}
