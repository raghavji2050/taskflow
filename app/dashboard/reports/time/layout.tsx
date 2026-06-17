import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata("Time Reports");

export default function TimeReportsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
