export const taskAssigneeInclude = {
  include: {
    user: { select: { id: true, name: true, email: true } },
  },
  orderBy: [{ isPrimary: "desc" as const }, { assignedAt: "asc" as const }],
};

export const taskListInclude = {
  category: true,
  tags: { include: { tag: true } },
  subtasks: { orderBy: { position: "asc" as const } },
  assignees: taskAssigneeInclude,
  user: { select: { id: true, name: true } },
  workspace: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, color: true } },
  section: { select: { id: true, name: true } },
  _count: { select: { comments: true, attachments: true } },
};

export const taskDetailInclude = {
  category: true,
  tags: { include: { tag: true } },
  subtasks: { orderBy: { position: "asc" as const } },
  assignees: taskAssigneeInclude,
  comments: {
    where: { parentId: null },
    include: {
      user: { select: { id: true, name: true } },
      replies: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" as const },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
  attachments: true,
  activities: { orderBy: { createdAt: "desc" as const }, take: 30 },
  reminders: true,
};

export interface TaskAssigneeInput {
  assigneeIds?: string[];
  primaryAssigneeId?: string | null;
}
