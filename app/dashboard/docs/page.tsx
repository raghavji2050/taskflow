import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { DocsClient } from "@/components/docs/DocsClient";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Docs",
  "Create, organize, and share documents with your team."
);

export default async function DocsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6">
      <DocsClient />
    </div>
  );
}
