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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
