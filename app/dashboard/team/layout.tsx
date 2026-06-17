import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Team",
  "Manage workspace members, invites, workload, and automations."
);

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
