import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
  dueDate: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Invalid due date"),
  categoryId: z.string().optional().nullable(),
  boardColumnId: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).default([]),
  primaryAssigneeId: z.string().optional().nullable(),
  workspaceId: z.string().optional().nullable(),
  recurrenceRule: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional().nullable(),
  tagIds: z.array(z.string()).optional(),
  position: z.number().int().optional(),
});

export const taskQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "ALL"]).optional().default("ALL"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "ALL"]).optional().default("ALL"),
  sort: z.enum(["dueDate", "createdAt", "priority", "position"]).optional().default("dueDate"),
  order: z.enum(["asc", "desc"]).optional().default("asc"),
  archived: z.enum(["true", "false", "all"]).optional().default("false"),
  categoryId: z.string().optional(),
  tagId: z.string().optional(),
  workspaceId: z.string().optional(),
  assignee: z.enum(["all", "me", "unassigned"]).optional().default("all"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export const categorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const boardColumnSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional().nullable(),
});

export const tagSchema = z.object({
  name: z.string().min(1).max(30),
});

export const subtaskSchema = z.object({
  title: z.string().min(1).max(200),
  completed: z.boolean().optional(),
  position: z.number().int().optional(),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(2000),
  parentId: z.string().optional().nullable(),
});

export const messageSchema = z.object({
  body: z.string().max(4000).default(""),
  parentId: z.string().optional().nullable(),
});

export const messageReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const updateMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const conversationPatchSchema = z.object({
  archived: z.boolean(),
});

export const conversationsQuerySchema = z.object({
  archived: z.enum(["true", "false"]).optional().default("false"),
});

export const createConversationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("DIRECT"),
    userId: z.string().min(1),
  }),
  z.object({
    type: z.literal("GROUP"),
    name: z.string().min(1).max(100).optional(),
    memberIds: z.array(z.string()).min(1).max(50),
  }),
]);

export const userSearchSchema = z.object({
  q: z.string().trim().min(2).max(100),
});

export const messagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  search: z.string().trim().min(1).max(200).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
});

export const messageSearchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
});

export const automationRuleSchema = z.object({
  name: z.string().min(1).max(100),
  trigger: z.enum(["task_overdue", "task_assigned", "status_changed", "due_date_approaching"]),
  action: z.enum(["notify_user", "notify_assignees", "set_status", "add_tag"]),
  config: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});

export const reminderSchema = z.object({
  remindAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
});

export const profileSchema = z.object({
  name: z.string().min(2).max(50),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6).max(100),
});

export const workspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(100),
});

export const bulkTaskSchema = z.object({
  taskIds: z.array(z.string()).min(1),
  action: z.enum(["complete", "archive", "delete", "pending"]),
});

export const documentTypeSchema = z.enum(["DOC", "SOP", "MEETING_NOTES", "NOTE"]);

export const documentSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(200000).default(""),
  type: documentTypeSchema.default("DOC"),
  icon: z.string().max(8).optional().nullable(),
  workspaceId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  pinned: z.boolean().optional(),
});

export const documentUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(200000).optional(),
  type: documentTypeSchema.optional(),
  icon: z.string().max(8).optional().nullable(),
  parentId: z.string().optional().nullable(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  changeNote: z.string().max(500).optional().nullable(),
});

export const documentsQuerySchema = z.object({
  workspaceId: z.string().optional(),
  search: z.string().optional(),
  type: documentTypeSchema.or(z.literal("ALL")).optional().default("ALL"),
  archived: z.enum(["true", "false"]).optional().default("false"),
  parentId: z.string().optional(),
  flat: z.enum(["true", "false"]).optional().default("false"),
});

export const documentCommentSchema = z.object({
  body: z.string().min(1).max(4000),
  parentId: z.string().optional().nullable(),
  versionId: z.string().optional().nullable(),
});

export const documentLinkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), taskId: z.string().min(1) }),
  z.object({ kind: z.literal("message"), messageId: z.string().min(1) }),
]);

export const documentUnlinkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), taskId: z.string().min(1) }),
  z.object({ kind: z.literal("message"), messageId: z.string().min(1) }),
]);

export const documentRestoreVersionSchema = z.object({
  versionId: z.string().min(1),
  changeNote: z.string().max(500).optional().nullable(),
});

export const documentShareSchema = z
  .object({
    conversationId: z.string().optional(),
    userId: z.string().optional(),
    body: z.string().max(4000).optional().default(""),
  })
  .refine((data) => Boolean(data.conversationId) !== Boolean(data.userId), {
    message: "Provide conversationId or userId, not both",
  });

export const forwardMessageSchema = z
  .object({
    sourceMessageId: z.string().min(1),
    conversationId: z.string().optional(),
    userId: z.string().optional(),
    body: z.string().max(4000).optional().default(""),
  })
  .refine((data) => Boolean(data.conversationId) !== Boolean(data.userId), {
    message: "Provide conversationId or userId, not both",
  });

const momPointsSchema = z
  .array(z.string().trim().min(1).max(2000))
  .min(1, "Add at least one point")
  .max(100);

const momActionItemSchema = z.object({
  id: z.string().optional(),
  task: z.string().trim().min(1).max(500),
  owner: z.string().max(200).optional().default(""),
  dueDate: z.string().max(50).optional().default(""),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  status: z.enum(["pending", "in_progress", "done"]).optional().default("pending"),
  taskId: z.string().min(1).optional().nullable(),
  createTask: z.boolean().optional().default(true),
});

const momDiscussionSchema = z.object({
  id: z.string().optional(),
  topic: z.string().trim().max(500).optional().default(""),
  points: z.array(z.string().trim().min(1).max(2000)).max(50).optional().default([]),
});

export const momStructuredContentSchema = z.object({
  location: z.string().max(500).optional().default(""),
  organizer: z.string().max(200).optional().default(""),
  agenda: z.array(z.string().trim().max(2000)).max(50).optional().default([]),
  discussions: z.array(momDiscussionSchema).max(30).optional().default([]),
  decisions: z.array(z.string().trim().max(2000)).max(50).optional().default([]),
  actionItems: z.array(momActionItemSchema).max(100).optional().default([]),
  risks: z.array(z.string().trim().max(2000)).max(50).optional().default([]),
  pendingItems: z.array(z.string().trim().max(2000)).max(50).optional().default([]),
  nextMeetingDate: z.string().max(50).optional().default(""),
  nextMeetingAgenda: z.string().max(2000).optional().default(""),
});

export const momCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }).optional().nullable(),
    content: momStructuredContentSchema,
    points: momPointsSchema.optional(),
    note: z.string().max(4000).optional().default(""),
    attendeeUserIds: z.array(z.string().min(1)).optional().default([]),
    allAttendees: z.boolean().optional().default(false),
  })
  .refine(
    (data) => {
      if (!data.endedAt) return true;
      return new Date(data.endedAt).getTime() >= new Date(data.startedAt).getTime();
    },
    { message: "End time must be after start time", path: ["endedAt"] }
  );

export const momUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    startedAt: z.string().datetime({ offset: true }).optional(),
    endedAt: z.string().datetime({ offset: true }).optional().nullable(),
    content: momStructuredContentSchema.optional(),
    points: momPointsSchema.optional(),
    attendeeUserIds: z.array(z.string().min(1)).optional(),
    allAttendees: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (!data.startedAt || !data.endedAt) return true;
      return new Date(data.endedAt).getTime() >= new Date(data.startedAt).getTime();
    },
    { message: "End time must be after start time", path: ["endedAt"] }
  );

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
