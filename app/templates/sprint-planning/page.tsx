import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import { getTemplateGuide } from "@/lib/templates";
import { TemplatePage } from "@/components/marketing/TemplatePage";

const data = getTemplateGuide("sprint-planning");

export const metadata: Metadata = createPageMetadata({
  title: data.title,
  absoluteTitle: data.title,
  description: data.desc,
  path: "/templates/sprint-planning",
});

export default function Page() {
  return <TemplatePage data={data} />;
}
