import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata("Activity log", "Who did what in your workspace: members, projects, tasks, files and security events.");

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
