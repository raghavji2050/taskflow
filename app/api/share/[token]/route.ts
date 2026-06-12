import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  const category = await prisma.category.findFirst({
    where: {
      shareToken: token,
      shareExpiry: { gt: new Date() },
    },
    include: {
      tasks: {
        where: { archived: false },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
        },
      },
    },
  });

  if (!category) return NextResponse.json({ error: "Not found or expired" }, { status: 404 });

  return NextResponse.json({
    category: { name: category.name, color: category.color },
    tasks: category.tasks,
  });
}
