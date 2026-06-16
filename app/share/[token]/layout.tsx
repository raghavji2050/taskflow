import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { createPageMetadata } from "@/lib/metadata";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: Pick<LayoutProps, "params">): Promise<Metadata> {
  const { token } = await params;
  const category = await prisma.category.findFirst({
    where: {
      shareToken: token,
      shareExpiry: { gt: new Date() },
    },
    select: { name: true },
  });

  if (!category) {
    return createPageMetadata({
      title: "Shared list",
      description: "View a shared TaskFlow task list.",
      noIndex: true,
    });
  }

  return createPageMetadata({
    title: `${category.name} (shared)`,
    description: `Shared task list: ${category.name}`,
    noIndex: true,
  });
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
