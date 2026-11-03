import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectError } from "@/lib/project-sections";
import * as tools from "@/lib/mcp/tools";

const status = z.enum(tools.STATUSES);
const priority = z.enum(tools.PRIORITIES);

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

export async function runTool(fn: () => Promise<unknown>): Promise<Result> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    if (error instanceof tools.McpToolError || error instanceof ProjectError) {
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

  return server;
}
