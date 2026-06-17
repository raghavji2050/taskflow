import { prisma } from "@/lib/prisma";
import { canAccessDocument } from "@/lib/documents";
import { canAccessTask } from "@/lib/workspace";
import { isBlobUrl } from "@/lib/blob-url";

export async function canUserAccessBlobUrl(userId: string, url: string) {
  if (!isBlobUrl(url)) return false;

  const messageAttachment = await prisma.messageAttachment.findFirst({
    where: { url },
    select: { message: { select: { conversationId: true } } },
  });
  if (messageAttachment) {
    const participant = await prisma.conversationParticipant.findFirst({
      where: { userId, conversationId: messageAttachment.message.conversationId },
    });
    return !!participant;
  }

  const taskAttachment = await prisma.attachment.findFirst({
    where: { url },
    select: { taskId: true },
  });
  if (taskAttachment) {
    return !!(await canAccessTask(userId, taskAttachment.taskId));
  }

  const documentAttachment = await prisma.documentAttachment.findFirst({
    where: { url },
    select: { documentId: true },
  });
  if (documentAttachment) {
    return canAccessDocument(userId, documentAttachment.documentId);
  }

  return false;
}
