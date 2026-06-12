import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/realtime";

export async function createNotification(params: {
  userId: string;
  title: string;
  body: string;
  type?: string;
  inviteId?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      title: params.title,
      body: params.body,
      type: params.type ?? "general",
      inviteId: params.inviteId,
    },
  });

  broadcastNotification(params.userId);
  return notification;
}
