import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { z } from "zod";

const importSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional().nullable(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
      dueDate: z.string().optional().nullable(),
    })
  ),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { tasks } = importSchema.parse(body);

    const created = await prisma.$transaction(
      tasks.map((t, i) =>
        prisma.task.create({
          data: {
            title: t.title,
            description: t.description || null,
            priority: t.priority ?? "MEDIUM",
            status: t.status ?? "PENDING",
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            userId: user.id,
            position: i,
          },
        })
      )
    );

    return NextResponse.json({ message: "Import successful", count: created.length });
  } catch (error) {
    return handleApiError(error);
  }
}
