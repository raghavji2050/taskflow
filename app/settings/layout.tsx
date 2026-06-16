import type { Metadata } from "next";
import { DashboardShell } from "@/components/DashboardShell";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Settings",
  "Manage your profile, notifications, and account security."
);

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
