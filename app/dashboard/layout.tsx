import type { Metadata } from "next";
import { DashboardShell } from "@/components/DashboardShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
