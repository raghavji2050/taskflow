import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Board",
  "Manage tasks on a drag-and-drop kanban board."
);

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
