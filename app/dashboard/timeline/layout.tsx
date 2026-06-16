import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Timeline",
  "Plan work over time with a Gantt-style timeline view."
);

export default function TimelineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
