import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";

const notificationsQuerySchema = z.object({
  archived: z.enum(["true", "false"]).optional().default("false"),
});

const notificationPatchSchema = z.object({
  ids: z.array(z.string()).min(1),
  read: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const query = notificationsQuerySchema.parse({
      archived: searchParams.get("archived") || undefined,
    });
    const showArchived = query.archived === "true";

    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        archivedAt: showArchived ? { not: null } : null,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        invite: {
          include: {
            workspace: { select: { id: true, name: true } },
            inviter: { select: { id: true, name: true } },
          },
        },
      },
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: user.id, read: false, archivedAt: null },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ids, read, archived } = notificationPatchSchema.parse(await request.json());
    const data: { read?: boolean; archivedAt?: Date | null } = {};
    if (read !== undefined) data.read = read;
    if (archived === true) data.archivedAt = new Date();
    if (archived === false) data.archivedAt = null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates specified" }, { status: 400 });
    }

    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId: user.id },
      data,
    });

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    return handleApiError(error);
  }
}
