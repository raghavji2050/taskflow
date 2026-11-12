import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata("Goals", "Workspace goals and OKRs with progress that updates itself from linked projects and tasks.");

export default function GoalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
