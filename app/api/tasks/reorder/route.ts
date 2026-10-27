import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { z } from "zod";
import { visibleTaskWhere } from "@/lib/visible-records";

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), position: z.number() })),
});

export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { items } = reorderSchema.parse(await request.json());
    const visible = await prisma.task.findMany({
      where: visibleTaskWhere({
        id: { in: items.map((item) => item.id) },
        userId: user.id,
      }),
      select: { id: true },
    });
    const allowed = new Set(visible.map((task) => task.id));
    const updates = items.filter((item) => allowed.has(item.id));
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((item) =>
          prisma.task.updateMany({
            where: { id: item.id, userId: user.id, deletedAt: null },
            data: { position: item.position },
          })
        )
      );
    }

    return NextResponse.json({ message: "Reordered" });
  } catch (error) {
    return handleApiError(error);
  }
}
