import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "My Work",
  "Tasks assigned to you, grouped by workspace and due date."
);

export default function MyWorkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
