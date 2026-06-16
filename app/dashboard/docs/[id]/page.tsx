import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocumentEditorClient } from "@/components/docs/DocumentEditorClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function DocumentPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  return (
    <div className="space-y-6">
      <DocumentEditorClient documentId={id} />
    </div>
  );
}
