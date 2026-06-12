import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

interface AutomationContext {
  taskId: string;
  taskTitle: string;
  workspaceId: string;
  status?: string;
  dueDate?: Date | null;
  assigneeIds?: string[];
}

export async function runAutomationsForTrigger(
  workspaceId: string,
  trigger: string,
  context: AutomationContext
) {
  const rules = await prisma.automationRule.findMany({
    where: { workspaceId, enabled: true, trigger },
  });

  for (const rule of rules) {
    const config = JSON.parse(rule.config || "{}") as Record<string, string>;
    switch (rule.action) {
      case "notify_assignees":
        for (const userId of context.assigneeIds ?? []) {
          await createNotification({
            userId,
            title: "Automation",
            body: config.message ?? `Update on "${context.taskTitle}"`,
            type: "automation",
          });
        }
        break;
      case "set_status":
        if (config.status) {
          await prisma.task.update({
            where: { id: context.taskId },
            data: { status: config.status as "PENDING" | "IN_PROGRESS" | "COMPLETED" },
          });
        }
        break;
      case "notify_user":
        if (config.userId) {
          await createNotification({
            userId: config.userId,
            title: "Automation",
            body: config.message ?? `Rule "${rule.name}" triggered`,
            type: "automation",
          });
        }
        break;
      default:
        break;
    }
  }
}

export async function runOverdueAutomations() {
  const now = new Date();
  const overdueTasks = await prisma.task.findMany({
    where: {
      workspaceId: { not: null },
      archived: false,
      status: { not: "COMPLETED" },
      dueDate: { lt: now },
    },
    include: {
      assignees: { select: { userId: true } },
      workspace: { select: { id: true, name: true } },
    },
    take: 50,
  });

  for (const task of overdueTasks) {
    if (!task.workspaceId) continue;
    await runAutomationsForTrigger(task.workspaceId, "task_overdue", {
      taskId: task.id,
      taskTitle: task.title,
      workspaceId: task.workspaceId,
      dueDate: task.dueDate,
      assigneeIds: task.assignees.map((a) => a.userId),
    });
  }
}
