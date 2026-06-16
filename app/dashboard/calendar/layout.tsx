import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Calendar",
  "See tasks and deadlines on a calendar."
);

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
