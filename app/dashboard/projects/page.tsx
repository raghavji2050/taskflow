import type { Metadata } from "next";
import { ProjectsListClient } from "@/components/projects/ProjectsListClient";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Projects",
  "Group workspace tasks into projects and sections."
);

export default function ProjectsPage() {
  return <ProjectsListClient />;
}
