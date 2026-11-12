import { z } from "zod";

const status = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]);
const priority = z.enum(["LOW", "MEDIUM", "HIGH"]);
const bool = z.enum(["true", "false"]).transform((v) => v === "true");

export const listTasksQuery = z.object({
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  status: status.optional(),
  priority: priority.optional(),
  search: z.string().max(200).optional(),
  dueBefore: z.string().max(40).optional(),
  assignedToMe: bool.optional(),
  includeCompleted: bool.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createTaskBody = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10_000).optional(),
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  priority: priority.optional(),
  status: status.optional(),
  dueDate: z.string().max(40).optional(),
  assigneeId: z.string().min(1).optional(),
});

export const updateTaskBody = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  status: status.optional(),
  priority: priority.optional(),
  dueDate: z.string().max(40).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  shiftDependents: z.boolean().optional(),
}).refine((b) => Object.keys(b).length > 0, "Send at least one field to change");

export const createWebhookBody = z.object({
  url: z.string().trim().min(8).max(500),
  events: z.array(z.string()).min(1).max(10).optional(),
  description: z.string().max(200).nullable().optional(),
});

export const updateWebhookBody = z.object({ active: z.boolean().optional(), events: z.array(z.string()).min(1).max(10).optional() });
