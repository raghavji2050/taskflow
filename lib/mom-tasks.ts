import type { Priority, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logTaskActivity } from "@/lib/activity";
import { linkDocumentToTask } from "@/lib/documents";
import { canEditMeetingMinutes } from "@/lib/meeting-minutes";
import {
  mapMomPriorityToTask,
  mapMomStatusToTask,
} from "@/lib/mom-action-task";
import {
  normalizeMomContent,
  parseMomContent,
  type MomActionItem,
  type MomStructuredContent,
} from "@/lib/mom-structured";
import { broadcastTaskEvent } from "@/lib/realtime";
import { getTaskWithAssignees, syncTaskAssignees } from "@/lib/task-assignees";
import { canEditWorkspaceTasks, getWorkspaceMembership } from "@/lib/workspace";
import { runAutomationsForTrigger } from "@/lib/automations";

export type MomLinkedTaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  workspaceId: string | null;
  actionItemId: string;
};

export type ProcessMomActionItemsResult = {
  content: MomStructuredContent;
  created: MomLinkedTaskSummary[];
  linked: number;
  skipped: number;
};

function resolveOwnerUserId(
  ownerName: string,
  participants: { id: string; name: string }[]
): string | null {
  const trimmed = ownerName.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const exact = participants.find((p) => p.name.trim().toLowerCase() === lower);
  return exact?.id ?? null;
}

function buildTaskDescription(params: {
  momTitle: string;
  owner?: string;
  includeOwnerLine?: boolean;
}) {
  const lines = [`From MoM: ${params.momTitle}`];
  if (params.includeOwnerLine && params.owner?.trim()) {
    lines.push(`Owner: ${params.owner.trim()}`);
  }
  return lines.join("\n");
}

async function createTaskFromActionItem(params: {
  item: MomActionItem;
  userId: string;
  actorName: string | null;
  momTitle: string;
  workspaceId: string | null;
  documentId: string;
  participants: { id: string; name: string }[];
}): Promise<MomLinkedTaskSummary> {
  const { item, userId, actorName, momTitle, workspaceId, documentId, participants } = params;
  const priority = mapMomPriorityToTask(item.priority);
  const status = mapMomStatusToTask(item.status);
  const title = item.task.trim().slice(0, 200);
  const dueDate = item.dueDate ? new Date(item.dueDate) : null;
  const ownerUserId = workspaceId ? resolveOwnerUserId(item.owner, participants) : null;

  const description = buildTaskDescription({
    momTitle,
    owner: item.owner,
    includeOwnerLine: !workspaceId || !ownerUserId,
  });

  const maxPos = await prisma.task.aggregate({
    where: workspaceId ? { workspaceId } : { userId, workspaceId: null },
    _max: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description,
      priority,
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      workspaceId: workspaceId ?? null,
      position: (maxPos._max.position ?? 0) + 1,
      userId,
    },
  });

  if (workspaceId && ownerUserId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    await syncTaskAssignees({
      taskId: task.id,
      workspaceId,
      assigneeIds: [ownerUserId],
      primaryAssigneeId: ownerUserId,
      actorId: userId,
      actorName: actorName ?? undefined,
      taskTitle: task.title,
      workspaceName: workspace?.name,
    });
    await runAutomationsForTrigger(workspaceId, "task_assigned", {
      taskId: task.id,
      taskTitle: task.title,
      workspaceId,
      assigneeIds: [ownerUserId],
    });
  }

  await linkDocumentToTask(userId, documentId, task.id);
  await logTaskActivity(task.id, "created", `Task "${task.title}" created from MoM`);
  broadcastTaskEvent({
    type: "task:created",
    workspaceId: task.workspaceId,
    ownerId: userId,
    actorId: userId,
    taskId: task.id,
  });

  const fullTask = await getTaskWithAssignees(task.id);
  return {
    id: fullTask!.id,
    title: fullTask!.title,
    status: fullTask!.status,
    workspaceId: fullTask!.workspaceId,
    actionItemId: item.id,
  };
}

export async function processMomActionItemsForDocument(params: {
  userId: string;
  actorName: string | null;
  documentId: string;
  momTitle: string;
  workspaceId: string | null;
  conversationId: string | null;
  content: MomStructuredContent;
}): Promise<ProcessMomActionItemsResult> {
  const participants = params.workspaceId
    ? (
        await prisma.workspaceMember.findMany({
          where: { workspaceId: params.workspaceId },
          select: { user: { select: { id: true, name: true } } },
        })
      ).map((m) => m.user)
    : params.conversationId
      ? (
          await prisma.conversationParticipant.findMany({
            where: { conversationId: params.conversationId },
            select: { user: { select: { id: true, name: true } } },
          })
        ).map((p) => p.user)
      : [];

  const created: MomLinkedTaskSummary[] = [];
  let linked = 0;
  let skipped = 0;

  const nextItems: MomActionItem[] = [];

  for (const item of params.content.actionItems) {
    if (!item.task.trim()) {
      skipped += 1;
      nextItems.push(item);
      continue;
    }

    if (item.taskId) {
      await linkDocumentToTask(params.userId, params.documentId, item.taskId);
      linked += 1;
      nextItems.push(item);
      continue;
    }

    if (item.createTask === false) {
      nextItems.push(item);
      continue;
    }

    const summary = await createTaskFromActionItem({
      item,
      userId: params.userId,
      actorName: params.actorName,
      momTitle: params.momTitle,
      workspaceId: params.workspaceId,
      documentId: params.documentId,
      participants,
    });
    created.push(summary);
    nextItems.push({ ...item, taskId: summary.id, createTask: true });
  }

  const content = normalizeMomContent({
    ...params.content,
    actionItems: params.content.actionItems.map((item) => {
      const updated = nextItems.find((n) => n.id === item.id);
      return updated ?? item;
    }),
  });

  return { content, created, linked, skipped };
}

export type CreateMomTasksResult = {
  created: MomLinkedTaskSummary[];
  skipped: number;
  alreadyLinked: number;
};

export async function createTasksFromMomActionItems(
  momId: string,
  userId: string,
  actorName: string | null
): Promise<CreateMomTasksResult> {
  if (!(await canEditMeetingMinutes(userId, momId))) {
    throw new Error("Forbidden");
  }

  const mom = await prisma.meetingMinutes.findUnique({
    where: { id: momId },
    include: {
      document: { select: { id: true, workspaceId: true, title: true } },
    },
  });

  if (!mom) throw new Error("Not found");

  const content = parseMomContent(mom.content);
  if (!content || content.actionItems.length === 0) {
    return { created: [], skipped: 0, alreadyLinked: 0 };
  }

  const workspaceId = mom.document.workspaceId;
  if (workspaceId) {
    const membership = await getWorkspaceMembership(userId, workspaceId);
    if (!membership || !canEditWorkspaceTasks(membership)) {
      throw new Error("Forbidden");
    }
  }

  const pendingCreate = content.actionItems.filter(
    (i) => i.task.trim() && !i.taskId && i.createTask !== false
  );
  const alreadyLinked = content.actionItems.filter((i) => i.task.trim() && i.taskId).length;

  if (pendingCreate.length === 0) {
    let linkedOnly = 0;
    for (const item of content.actionItems) {
      if (item.taskId) {
        await linkDocumentToTask(userId, mom.documentId, item.taskId);
        linkedOnly += 1;
      }
    }
    return {
      created: [],
      skipped: content.actionItems.filter((i) => !i.task.trim()).length,
      alreadyLinked: linkedOnly || alreadyLinked,
    };
  }

  const result = await processMomActionItemsForDocument({
    userId,
    actorName,
    documentId: mom.documentId,
    momTitle: mom.title,
    workspaceId,
    conversationId: mom.conversationId,
    content,
  });

  await prisma.meetingMinutes.update({
    where: { id: momId },
    data: { content: result.content as object },
  });

  return {
    created: result.created,
    skipped: result.skipped,
    alreadyLinked: result.linked + alreadyLinked,
  };
}
