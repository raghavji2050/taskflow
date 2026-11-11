import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectError } from "@/lib/project-sections";
import * as tools from "@/lib/mcp/tools";
import * as extra from "@/lib/mcp/tools-extra";
import * as more from "@/lib/mcp/tools-more";
import * as smart from "@/lib/mcp/tools-smart";
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
      description: "Update a task's title, status, priority, due date or assignee. dueDate/assigneeId = null clears it. Moving a due date later also shifts open tasks it blocks by the same amount (set shiftDependents: false to skip).",
      inputSchema: {
        taskId: z.string(),
        title: z.string().trim().min(1).max(200).optional(),
        status: status.optional(),
        priority: priority.optional(),
        dueDate: z.string().nullable().optional(),
        assigneeId: z.string().nullable().optional(),
        shiftDependents: z.boolean().optional(),
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

  const role = z.enum(["ADMIN", "MEMBER", "VIEWER"]);
  const range = z.enum(["today", "week", "month", "all"]);
  const P = <K extends keyof typeof more>(k: K) => ((a: never) => (more[k] as (u: tools.McpUser, a: never) => Promise<unknown>)(user, a)) as (a: never) => Promise<unknown>;
  // projects & sections
  add("get_project", "Get a project with its sections, members and your access.", { projectId: id }, P("getProject"), true);
  add("delete_project", "Move a project to trash (restorable). Needs manage rights.", { projectId: id }, P("deleteProject"));
  add("rename_section", "Rename a project section.", { projectId: id, sectionId: id, name: z.string().trim().min(1).max(80) }, P("renameSection"));
  add("delete_section", "Delete a section (its tasks move to another section).", { projectId: id, sectionId: id }, P("deleteSection"));
  add("reorder_sections", "Reorder sections: pass all section ids in the new order.", { projectId: id, sectionIds: z.array(id).min(1).max(100) }, P("reorderSections"));
  add("list_project_members", "List members of a project and their roles.", { projectId: id }, P("listProjectMembers"), true);
  add("add_project_member", "Add a workspace member to a project.", { projectId: id, userId: id, role }, P("addProjectMember"));
  add("update_project_member", "Change a project member's role (memberId from list_project_members).", { projectId: id, memberId: id, role }, P("updateProjectMember"));
  add("remove_project_member", "Remove a member from a project.", { projectId: id, memberId: id }, P("removeProjectMember"));
  // task extras
  add("list_task_dependencies", "Show what a task is blocked by and what it is blocking, with how many blockers are still open.", { taskId: id }, P("listTaskDependencies"), true);
  add("add_task_dependency", "Mark taskId as blocked by blockedByTaskId (same workspace; loops are refused).", { taskId: id, blockedByTaskId: id }, P("addTaskDependency"));
  add("remove_task_dependency", "Remove a 'blocked by' link between two tasks.", { taskId: id, blockedByTaskId: id }, P("removeTaskDependency"));
  // custom fields
  add("list_custom_fields", "List a project's custom fields (id, name, type TEXT/NUMBER/DATE/DROPDOWN, dropdown options).", { projectId: id }, P("listCustomFields"), true);
  add("create_custom_field", "Add a custom field to a project (needs project manage rights). DROPDOWN needs options.", { projectId: id, name: z.string().trim().min(1).max(80), type: z.enum(["TEXT", "NUMBER", "DATE", "DROPDOWN"]), options: z.array(z.string().max(60)).max(30).optional() }, P("createCustomField"));
  add("delete_custom_field", "Delete a project custom field and all task values for it (needs project manage rights).", { projectId: id, fieldId: id }, P("deleteCustomField"));
  add("get_task_custom_fields", "Show the custom fields of a task's project and this task's values.", { taskId: id }, P("getTaskCustomFields"), true);
  add("set_task_field_value", "Set a task's custom field value (number, YYYY-MM-DD date, dropdown option, or text). null or empty clears it.", { taskId: id, fieldId: id, value: z.union([z.string().max(500), z.number(), z.null()]) }, P("setTaskFieldValue"));
  // insights
  add("get_insights", "Dashboard numbers: open/overdue/due-this-week totals, tasks by status, open+overdue per assignee, per-project open/done, and completed vs created per week. Scope: projectId, workspaceId, or neither for personal tasks. tzOffsetMinutes uses JS getTimezoneOffset sign (IST = -330).", { workspaceId: id.optional(), projectId: id.optional(), tzOffsetMinutes: z.number().int().min(-840).max(840).optional(), weeks: z.number().int().min(1).max(26).optional() }, P("getInsights"), true);
  add("delete_subtask", "Delete a subtask.", { subtaskId: id }, P("deleteSubtask"));
  add("update_comment", "Edit one of your own task comments.", { commentId: id, body: z.string().trim().min(1).max(5000) }, P("updateComment"));
  add("delete_comment", "Delete one of your own task comments.", { commentId: id }, P("deleteComment"));
  add("list_task_activity", "Show a task's activity history (newest first).", { taskId: id, limit: z.number().int().min(1).max(100).optional() }, P("listTaskActivity"), true);
  add("list_reminders", "List reminders on a task.", { taskId: id }, P("listReminders"), true);
  add("add_reminder", "Add a reminder to a task at an ISO datetime.", { taskId: id, remindAt: z.string() }, P("addReminder"));
  add("delete_reminder", "Delete a task reminder.", { reminderId: id }, P("deleteReminder"));
  // time tracking
  add("get_active_timer", "Show your running/paused timer, if any.", {}, P("getActiveTimer"), true);
  add("start_timer", "Start a timer on a task (stops any other running timer).", { taskId: id, description: z.string().max(500).optional() }, P("startTimer"));
  add("stop_timer", "Stop your running timer.", { timeEntryId: id.optional() }, P("stopTimer"));
  add("pause_timer", "Pause your running timer.", { timeEntryId: id.optional() }, P("pauseTimer"));
  add("resume_timer", "Resume your paused timer.", { timeEntryId: id.optional() }, P("resumeTimer"));
  add("log_time", "Log time manually on a task for a date (YYYY-MM-DD).", { taskId: id, date: z.string(), minutes: z.number().positive().max(1440), description: z.string().max(500).optional() }, P("logTime"));
  add("list_time_entries", "List time entries: for a task (taskId) or your own (optionally per workspace), with a report.", { taskId: id.optional(), workspaceId: id.optional(), range: range.optional(), limit: z.number().int().min(1).max(100).optional() }, P("listTimeEntries"), true);
  add("update_time_entry", "Edit a time entry's description or duration (minutes).", { entryId: id, description: z.string().max(500).nullable().optional(), minutes: z.number().positive().max(1440).optional() }, P("updateTimeEntry"));
  add("delete_time_entry", "Delete a time entry.", { entryId: id }, P("deleteTimeEntry"));
  // documents
  add("list_documents", "List docs you can see (personal + workspaces), optionally by workspace or title search.", { workspaceId: id.optional(), includeArchived: z.boolean().optional(), search: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() }, P("listDocuments"), true);
  add("get_document", "Read a document with its full body.", { documentId: id }, P("getDocument"), true);
  add("create_document", "Create a document (personal, or in a workspace).", { title: z.string().trim().min(1).max(200), body: z.string().max(200000).optional(), workspaceId: id.optional(), parentId: id.optional() }, P("createDocument"));
  add("update_document", "Edit a document's title/body, pin it, or archive it (archived=true). Saves a version.", { documentId: id, title: z.string().trim().min(1).max(200).optional(), body: z.string().max(200000).optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() }, P("updateDocument"));
  // chat
  add("list_conversations", "List your chats (direct, group, workspace channels) with unread counts.", {}, P("listConversations"), true);
  add("list_messages", "Read messages in a conversation (newest page; pass cursor for older).", { conversationId: id, limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() }, P("listMessages"), true);
  add("send_message", "Send a chat message as you (optionally as a thread reply via parentId).", { conversationId: id, body: z.string().trim().min(1).max(10000), parentId: id.optional() }, P("sendChatMessage"));
  add("edit_message", "Edit one of your chat messages.", { conversationId: id, messageId: id, body: z.string().trim().min(1).max(10000) }, P("editChatMessage"));
  add("delete_message", "Delete one of your chat messages.", { conversationId: id, messageId: id }, P("deleteChatMessage"));
  add("react_to_message", "Toggle an emoji reaction on a chat message.", { conversationId: id, messageId: id, emoji: z.string().min(1).max(16) }, P("reactToMessage"));
  add("pin_message", "Pin or unpin a chat message.", { conversationId: id, messageId: id, pinned: z.boolean() }, P("pinMessage"));
  add("mark_conversation_read", "Mark a conversation as read.", { conversationId: id }, P("markConversationRead"));
  add("search_messages", "Search your chat messages.", { query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(50).optional() }, P("searchMessages"), true);
  add("start_direct_chat", "Open (or find) a direct chat with a user; returns conversationId.", { userId: id }, P("startDirectChat"));
  // workspace
  add("invite_member", "Invite someone to a workspace by email (owner/admin only).", { workspaceId: id, email: z.string().email() }, P("inviteMember"));

  // smart
  add("plan_my_day", "Your prioritized plan for today: overdue first, then due today, then high-priority / in-progress, plus your active timer. tzOffsetMinutes defaults to IST (330).", { tzOffsetMinutes: z.number().int().min(-720).max(840).optional(), limit: z.number().int().min(1).max(50).optional() }, (a: { tzOffsetMinutes?: number; limit?: number }) => smart.planMyDay(user, a), true);
  add("find_blockers", "Find stuck work: overdue tasks, in-progress tasks with open subtasks, and tasks with no activity for staleDays (default 7), counted per assignee. Scope by workspaceId/projectId or all you can see.", { workspaceId: id.optional(), projectId: id.optional(), staleDays: z.number().int().min(1).max(90).optional() }, (a: { workspaceId?: string; projectId?: string; staleDays?: number }) => smart.findBlockers(user, a), true);
  add("weekly_report", "Summary for the last `days` (default 7): completed, created, overdue now, hours logged, and per-member breakdown. Scope by workspaceId/projectId or all you can see.", { workspaceId: id.optional(), projectId: id.optional(), days: z.number().int().min(1).max(31).optional() }, (a: { workspaceId?: string; projectId?: string; days?: number }) => smart.weeklyReport(user, a), true);
  return server;
}
