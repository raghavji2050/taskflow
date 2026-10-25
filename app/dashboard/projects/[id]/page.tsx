import type { Metadata } from "next";
import { ProjectViewClient } from "@/components/projects/ProjectViewClient";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Project",
  "List and board views for tasks grouped by section."
);

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: PageProps) {
  const { id } = await params;
  return <ProjectViewClient projectId={id} />;
}
