import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Workspace",
  "Switch to a team workspace."
);

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
