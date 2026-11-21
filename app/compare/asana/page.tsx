import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import { getComparison } from "@/lib/compare";
import { ComparePage } from "@/components/marketing/ComparePage";

const data = getComparison("asana");

export const metadata: Metadata = createPageMetadata({
  title: data.title,
  absoluteTitle: data.title,
  description: data.description,
  path: "/compare/asana",
});

export default function Page() {
  return <ComparePage data={data} />;
}
