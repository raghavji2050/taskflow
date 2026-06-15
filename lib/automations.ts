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

interface RuleConfig {
  message?: string;
  userId?: string;
  status?: string;
  tagId?: string;
  hoursBefore?: string;
  _fired?: Record<string, string>;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function alreadyFiredToday(config: RuleConfig, taskId: string, ruleId: string) {
  const key = `${taskId}:${ruleId}`;
  return config._fired?.[key] === todayKey();
}

async function markFired(ruleId: string, config: RuleConfig, taskId: string) {
  const key = `${taskId}:${ruleId}`;
  const nextConfig: RuleConfig = {
    ...config,
    _fired: { ...(config._fired ?? {}), [key]: todayKey() },
  };
  await prisma.automationRule.update({
    where: { id: ruleId },
    data: { config: JSON.stringify(nextConfig) },
  });
}

async function executeRuleAction(
  rule: { id: string; name: string; action: string; config: string },
  context: AutomationContext,
  config: RuleConfig
) {
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
    case "add_tag":
      if (config.tagId) {
        await prisma.taskTag.upsert({
          where: {
            taskId_tagId: { taskId: context.taskId, tagId: config.tagId },
          },
          create: { taskId: context.taskId, tagId: config.tagId },
          update: {},
        });
      }
      break;
    default:
      break;
  }
}

export async function runAutomationsForTrigger(
  workspaceId: string,
  trigger: string,
  context: AutomationContext,
  options?: { dedupeDaily?: boolean }
) {
  const rules = await prisma.automationRule.findMany({
    where: { workspaceId, enabled: true, trigger },
  });

  for (const rule of rules) {
    const config = JSON.parse(rule.config || "{}") as RuleConfig;
    if (options?.dedupeDaily && alreadyFiredToday(config, context.taskId, rule.id)) {
      continue;
    }
    await executeRuleAction(rule, context, config);
    if (options?.dedupeDaily) {
      await markFired(rule.id, config, context.taskId);
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
    await runAutomationsForTrigger(
      task.workspaceId,
      "task_overdue",
      {
        taskId: task.id,
        taskTitle: task.title,
        workspaceId: task.workspaceId,
        dueDate: task.dueDate,
        assigneeIds: task.assignees.map((a) => a.userId),
      },
      { dedupeDaily: true }
    );
  }
}

export async function runDueDateApproachingAutomations() {
  const now = new Date();
  const rules = await prisma.automationRule.findMany({
    where: { enabled: true, trigger: "due_date_approaching" },
  });

  const byWorkspace = new Map<string, typeof rules>();
  for (const rule of rules) {
    const list = byWorkspace.get(rule.workspaceId) ?? [];
    list.push(rule);
    byWorkspace.set(rule.workspaceId, list);
  }

  for (const [workspaceId, workspaceRules] of byWorkspace) {
    const hoursBefore = Math.max(
      1,
      ...workspaceRules.map((r) => {
        const cfg = JSON.parse(r.config || "{}") as RuleConfig;
        return parseInt(cfg.hoursBefore ?? "24", 10) || 24;
      })
    );
    const windowEnd = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);

    const tasks = await prisma.task.findMany({
      where: {
        workspaceId,
        archived: false,
        status: { not: "COMPLETED" },
        dueDate: { gt: now, lte: windowEnd },
      },
      include: { assignees: { select: { userId: true } } },
      take: 50,
    });

    for (const task of tasks) {
      await runAutomationsForTrigger(
        workspaceId,
        "due_date_approaching",
        {
          taskId: task.id,
          taskTitle: task.title,
          workspaceId,
          dueDate: task.dueDate,
          assigneeIds: task.assignees.map((a) => a.userId),
        },
        { dedupeDaily: true }
      );
    }
  }
}
