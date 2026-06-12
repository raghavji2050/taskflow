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
  assigneeId: z.string().optional().nullable(),
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
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export const categorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
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
  name: z.string().min(1).max(100),
});

export const bulkTaskSchema = z.object({
  taskIds: z.array(z.string()).min(1),
  action: z.enum(["complete", "archive", "delete", "pending"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
