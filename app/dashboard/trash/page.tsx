import type { Metadata } from "next";
import { TrashClient } from "@/components/trash/TrashClient";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Trash",
  "Restore or permanently delete tasks and projects."
);

export default function TrashPage() {
  return <TrashClient />;
}
