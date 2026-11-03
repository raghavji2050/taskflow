import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectError } from "@/lib/project-sections";
import * as tools from "@/lib/mcp/tools";
import * as extra from "@/lib/mcp/tools-extra";
import { TrashError } from "@/lib/trash";

const status = z.enum(tools.STATUSES);
const priority = z.enum(tools.PRIORITIES);

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

export async function runTool(fn: () => Promise<unknown>): Promise<Result> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    if (error instanceof tools.McpToolError || error instanceof ProjectError || error instanceof TrashError) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    throw error;
  }
}

export function createTaskflowMcpServer(user: tools.McpUser) {
  const server = new McpServer({ name: "taskflow", version: "1.0.0" });

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List the taskflow projects you can see, grouped by workspace.",
      inputSchema: { workspaceId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    (args) => runTool(() => tools.listProjects(user, args))
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "List tasks. Without projectId/workspaceId returns your personal tasks, tasks you created and tasks assigned to you. Completed tasks are hidden unless status=COMPLETED or includeCompleted=true.",
      inputSchema: {
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
        status: status.optional(),
        priority: priority.optional(),
        assignedToMe: z.boolean().optional(),
        search: z.string().max(200).optional(),
        dueBefore: z.string().optional().describe("ISO date, e.g. 2026-11-10"),
        includeCompleted: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => runTool(() => tools.listTasks(user, args))
  );

  server.registerTool(
    "get_task",
    {
      title: "Get task",
      description: "Get one task with description, subtasks and recent comments.",
      inputSchema: { taskId: z.string() },
      annotations: { readOnlyHint: true },
    },
    (args) => runTool(() => tools.getTask(user, args))
  );

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Create a task. Pass projectId to add it to a project; omit both projectId and workspaceId for a personal task.",
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).optional(),
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
        priority: priority.optional(),
        status: status.optional(),
        dueDate: z.string().optional().describe("ISO date or datetime"),
        assigneeId: z.string().optional().describe("User id of a workspace member"),
      },
    },
    (args) => runTool(() => tools.createTask(user, args))
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description: "Update a task's title, status, priority, due date or assignee. dueDate/assigneeId = null clears it.",
      inputSchema: {
        taskId: z.string(),
        title: z.string().trim().min(1).max(200).optional(),
        status: status.optional(),
        priority: priority.optional(),
        dueDate: z.string().nullable().optional(),
        assigneeId: z.string().nullable().optional(),
      },
      annotations: { idempotentHint: true },
    },
    (args) => runTool(() => tools.updateTask(user, args))
  );

  server.registerTool(
    "add_comment",
    {
      title: "Add comment",
      description: "Add a comment to a task as you.",
      inputSchema: { taskId: z.string(), body: z.string().trim().min(1).max(5000) },
    },
    (args) => runTool(() => tools.addComment(user, args))
  );

  const ro = { readOnlyHint: true };
  const add = (name: string, description: string, inputSchema: z.ZodRawShape, fn: (a: never) => Promise<unknown>, readOnly = false) =>
    server.registerTool(name, { title: name.replace(/_/g, " "), description, inputSchema, annotations: readOnly ? ro : { destructiveHint: name.startsWith("delete") } }, ((args: never) => runTool(() => fn(args))) as never);
  const id = z.string().min(1);

  add("whoami", "Show which taskflow account this connection is signed in as, with counts of workspaces, tasks and notifications.", {}, () => extra.whoami(user), true);
  add("list_workspaces", "List workspaces you belong to and your role. Archived workspaces are hidden unless includeArchived=true.", { includeArchived: z.boolean().optional() }, (a: { includeArchived?: boolean }) => extra.listWorkspaces(user, a), true);
  add("list_workspace_members", "List members of a workspace (use their ids to assign tasks).", { workspaceId: id }, (a: { workspaceId: string }) => extra.listWorkspaceMembers(user, a), true);
  add("assign_task", "Set the assignees of a workspace task (replaces existing). Empty list unassigns.", { taskId: id, assigneeIds: z.array(id).max(20) }, (a: { taskId: string; assigneeIds: string[] }) => extra.assignTask(user, a));
  add("create_project", "Create a project in a workspace (not allowed for viewers).", { workspaceId: id, name: z.string().trim().min(1).max(100), description: z.string().max(1000).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }, (a: Parameters<typeof extra.createProject>[1]) => extra.createProject(user, a));
  add("update_project", "Rename / recolor / describe a project, or archive it (archived=true) / unarchive. Needs project manage rights.", { projectId: id, name: z.string().trim().min(1).max(100).optional(), description: z.string().max(1000).nullable().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), archived: z.boolean().optional() }, (a: Parameters<typeof extra.updateProject>[1]) => extra.updateProject(user, a));
  add("list_sections", "List the sections (board columns) of a project.", { projectId: id }, (a: { projectId: string }) => extra.listSections(user, a), true);
  add("create_section", "Add a section to a project.", { projectId: id, name: z.string().trim().min(1).max(80) }, (a: { projectId: string; name: string }) => extra.createSection(user, a));
  add("move_task", "Move a workspace task to another section and/or project.", { taskId: id, projectId: id.optional(), sectionId: id.optional() }, (a: Parameters<typeof extra.moveTask>[1]) => extra.moveTask(user, a));
  add("delete_task", "Move a task to trash (restorable).", { taskId: id }, (a: { taskId: string }) => extra.deleteTask(user, a));
  add("list_trash", "List trashed items. Without workspaceId lists your personal trash.", { workspaceId: id.optional() }, (a: { workspaceId?: string }) => extra.listTrash(user, a), true);
  add("restore_from_trash", "Restore a trashed task or project. Pass workspaceId for workspace items.", { kind: z.enum(["task", "project"]), id, workspaceId: id.optional() }, (a: Parameters<typeof extra.restoreFromTrash>[1]) => extra.restoreFromTrash(user, a));
  add("list_subtasks", "List subtasks of a task.", { taskId: id }, (a: { taskId: string }) => extra.listSubtasks(user, a), true);
  add("create_subtask", "Add a subtask to a task.", { taskId: id, title: z.string().trim().min(1).max(200) }, (a: { taskId: string; title: string }) => extra.createSubtask(user, a));
  add("update_subtask", "Rename or complete/uncomplete a subtask.", { subtaskId: id, title: z.string().trim().min(1).max(200).optional(), completed: z.boolean().optional() }, (a: Parameters<typeof extra.updateSubtask>[1]) => extra.updateSubtask(user, a));
  add("list_comments", "List comments on a task (newest first).", { taskId: id, limit: z.number().int().min(1).max(100).optional() }, (a: { taskId: string; limit?: number }) => extra.listComments(user, a), true);
  add("search_tasks", "Full-text search across all tasks you can see (title + description).", { query: z.string().trim().min(1).max(200), includeCompleted: z.boolean().optional(), limit: z.number().int().min(1).max(50).optional() }, (a: Parameters<typeof extra.searchTasks>[1]) => extra.searchTasks(user, a), true);
  add("list_tags", "List your labels/tags.", {}, () => extra.listTags(user), true);
  add("set_task_tags", "Set your labels on a task by name (creates missing labels). Empty list clears.", { taskId: id, tags: z.array(z.string().max(50)).max(20) }, (a: { taskId: string; tags: string[] }) => extra.setTaskTags(user, a));
  add("set_recurrence", "Make a task repeat DAILY/WEEKLY/MONTHLY, or null to stop.", { taskId: id, rule: z.enum(extra.RECURRENCES).nullable() }, (a: Parameters<typeof extra.setRecurrence>[1]) => extra.setRecurrence(user, a));
  add("list_notifications", "List your notifications (full body, plus the short stored preview) and unread count.", { unreadOnly: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() }, (a: { unreadOnly?: boolean; limit?: number }) => extra.listNotifications(user, a), true);
  add("get_notification", "Read one notification with its full body (chat notifications resolve the full message).", { id }, (a: { id: string }) => extra.getNotification(user, a), true);
  add("mark_notifications_read", "Mark notifications read by ids, or all=true.", { ids: z.array(id).max(100).optional(), all: z.boolean().optional() }, (a: { ids?: string[]; all?: boolean }) => extra.markNotificationsRead(user, a));

  return server;
}
