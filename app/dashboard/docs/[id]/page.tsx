import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { DocumentEditorClient } from "@/components/docs/DocumentEditorClient";
import { prisma } from "@/lib/prisma";
import { appPageMetadata } from "@/lib/metadata";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { title: true },
  });

  return appPageMetadata(
    doc?.title?.trim() || "Document",
    doc?.title ? `Edit ${doc.title}` : "View and edit a document."
  );
}

export default async function DocumentPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/api/session-ended");

  const { id } = await params;

  return (
    <div className="space-y-6">
      <DocumentEditorClient documentId={id} />
    </div>
  );
}
