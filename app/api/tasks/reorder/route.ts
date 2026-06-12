import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { z } from "zod";

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), position: z.number() })),
});

export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { items } = reorderSchema.parse(await request.json());

    await prisma.$transaction(
      items.map((item) =>
        prisma.task.updateMany({
          where: { id: item.id, userId: user.id },
          data: { position: item.position },
        })
      )
    );

    return NextResponse.json({ message: "Reordered" });
  } catch (error) {
    return handleApiError(error);
  }
}
