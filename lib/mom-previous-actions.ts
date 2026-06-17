import { prisma } from "@/lib/prisma";
import { canAccessConversation } from "@/lib/chat-access";
import { parseMomContent, type MomActionItem } from "@/lib/mom-structured";

export type PreviousMomActionItem = Pick<
  MomActionItem,
  "task" | "owner" | "dueDate" | "priority" | "status" | "taskId"
> & {
  sourceActionId: string;
};

export type PreviousMomActionsGroup = {
  momId: string;
  title: string;
  startedAt: string;
  actions: PreviousMomActionItem[];
};

export async function getPreviousMomActionsForConversation(
  userId: string,
  conversationId: string,
  limit = 5
): Promise<PreviousMomActionsGroup[]> {
  const participant = await canAccessConversation(userId, conversationId);
  if (!participant) {
    throw new Error("Forbidden");
  }

  const moms = await prisma.meetingMinutes.findMany({
    where: { conversationId },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      startedAt: true,
      content: true,
    },
  });

  return moms
    .map((mom) => {
      const content = parseMomContent(mom.content);
      const actions: PreviousMomActionItem[] = (content?.actionItems ?? []).map((item) => ({
        sourceActionId: item.id,
        task: item.task,
        owner: item.owner,
        dueDate: item.dueDate,
        priority: item.priority,
        status: item.status,
        taskId: item.taskId ?? null,
      }));

      return {
        momId: mom.id,
        title: mom.title,
        startedAt: mom.startedAt.toISOString(),
        actions,
      };
    })
    .filter((group) => group.actions.length > 0);
}
