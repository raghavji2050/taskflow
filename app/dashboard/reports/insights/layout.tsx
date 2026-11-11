import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata("Insights", "Charts for status, workload, overdue work and weekly throughput.");

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
