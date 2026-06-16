import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "API reference",
  description: "TaskFlow REST API documentation and endpoint reference.",
  noIndex: true,
});

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
