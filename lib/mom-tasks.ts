import type { Priority, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logTaskActivity } from "@/lib/activity";
import { getDocumentLinkContext, linkDocumentToTasks } from "@/lib/documents";
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
import { syncTaskAssignees } from "@/lib/task-assignees";
import { canEditWorkspaceTasks, getWorkspaceMembership } from "@/lib/workspace";
import { runAutomationsForTrigger } from "@/lib/automations";
import { resolveTaskPlacement } from "@/lib/projects";

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

type MomWriteContext = {
  canLinkDocument: boolean;
  documentWorkspaceId: string | null;
  position: { next: number | null };
  placement: { projectId: string; sectionId: string; position: number } | null;
  workspaceName: string | undefined;
  workspaceNameLoaded: boolean;
  assignedRules: { id: string; name: string; action: string; config: string }[] | null;
};

async function createTaskFromActionItem(
  params: {
    item: MomActionItem;
    userId: string;
    actorName: string | null;
    momTitle: string;
    workspaceId: string | null;
    documentId: string;
    participants: { id: string; name: string }[];
  },
  ctx: MomWriteContext
): Promise<MomLinkedTaskSummary> {
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

  let projectId: string | null = null;
  let sectionId: string | null = null;
  let position: number;

  if (workspaceId) {
    const placement = ctx.placement ?? await resolveTaskPlacement({ workspaceId });
    ctx.placement = placement;
    projectId = placement.projectId;
    sectionId = placement.sectionId;
    position = placement.position;
    placement.position += 1;
  } else {
    if (ctx.position.next == null) {
      const maxPos = await prisma.task.aggregate({
        where: { userId, workspaceId: null },
        _max: { position: true },
      });
      ctx.position.next = (maxPos._max.position ?? 0) + 1;
    }
    position = ctx.position.next;
    ctx.position.next += 1;
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      priority,
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      workspaceId: workspaceId ?? null,
      projectId,
      sectionId,
      position,
      userId,
    },
  });

  if (workspaceId && ownerUserId) {
    if (!ctx.workspaceNameLoaded) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      });
      ctx.workspaceName = workspace?.name;
      ctx.workspaceNameLoaded = true;
    }
    await syncTaskAssignees({
      taskId: task.id,
      workspaceId,
      assigneeIds: [ownerUserId],
      primaryAssigneeId: ownerUserId,
      actorId: userId,
      actorName: actorName ?? undefined,
      taskTitle: task.title,
      workspaceName: ctx.workspaceName,
    });
    if (!ctx.assignedRules) {
      ctx.assignedRules = await prisma.automationRule.findMany({
        where: { workspaceId, enabled: true, trigger: "task_assigned" },
      });
    }
    await runAutomationsForTrigger(
      workspaceId,
      "task_assigned",
      {
        taskId: task.id,
        taskTitle: task.title,
        workspaceId,
        assigneeIds: [ownerUserId],
      },
      { rules: ctx.assignedRules }
    );
  }

  if (ctx.canLinkDocument) {
    const docWorkspaceId = ctx.documentWorkspaceId;
    const taskWorkspaceId = task.workspaceId;
    const sameWorkspace =
      !(docWorkspaceId && taskWorkspaceId !== docWorkspaceId) &&
      !(!docWorkspaceId && taskWorkspaceId);
    if (sameWorkspace) {
      await prisma.documentTask.upsert({
        where: { documentId_taskId: { documentId, taskId: task.id } },
        update: {},
        create: { documentId, taskId: task.id },
      });
    }
  }
  await logTaskActivity(task.id, "created", `Task "${task.title}" created from MoM`);
  broadcastTaskEvent({
    type: "task:created",
    workspaceId: task.workspaceId,
    ownerId: userId,
    actorId: userId,
    taskId: task.id,
  });

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    workspaceId: task.workspaceId,
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

  const linkCtx = await getDocumentLinkContext(params.userId, params.documentId);
  const existingTaskIds = params.content.actionItems
    .filter((item) => item.task.trim() && item.taskId)
    .map((item) => item.taskId as string);
  await linkDocumentToTasks(params.userId, params.documentId, existingTaskIds, linkCtx);

  const writeCtx: MomWriteContext = {
    canLinkDocument: linkCtx.canEdit,
    documentWorkspaceId: linkCtx.workspaceId,
    position: { next: null },
    placement: null,
    workspaceName: undefined,
    workspaceNameLoaded: false,
    assignedRules: null,
  };

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
      linked += 1;
      nextItems.push(item);
      continue;
    }

    if (item.createTask === false) {
      nextItems.push(item);
      continue;
    }

    const summary = await createTaskFromActionItem(
      {
        item,
        userId: params.userId,
        actorName: params.actorName,
        momTitle: params.momTitle,
        workspaceId: params.workspaceId,
        documentId: params.documentId,
        participants,
      },
      writeCtx
    );
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
    const linkedIds = content.actionItems
      .filter((item) => item.taskId)
      .map((item) => item.taskId as string);
    await linkDocumentToTasks(userId, mom.documentId, linkedIds);
    const linkedOnly = linkedIds.length;
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
