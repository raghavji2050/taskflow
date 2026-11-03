# Taskflow MCP server

Taskflow exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so Claude (and any MCP client) can read and manage your tasks.

- **Endpoint:** `https://<your-taskflow-domain>/api/mcp` (Streamable HTTP, stateless, JSON responses)
- **Auth:** OAuth 2.1 (claude.ai / Claude mobile / any MCP client — just paste the URL) **or** `Authorization: Bearer tf_...` personal API token
- **Scope:** the token acts as you. It sees only what you can see in the app and obeys workspace/project roles (viewers can't edit or comment).
- **Rate limit:** 60 requests / minute per token.

## Tools (69)

| Tool | What it does |
|---|---|
| `list_projects` | List the taskflow projects you can see, grouped by workspace. |
| `list_tasks` | List tasks. Without projectId/workspaceId returns your personal tasks, tasks you created and tasks assigned to you. Completed tasks are hidden unless status=COMPLETED or includeCompleted=true. |
| `get_task` | Get one task with description, subtasks and recent comments. |
| `create_task` | Create a task. Pass projectId to add it to a project; omit both projectId and workspaceId for a personal task. |
| `update_task` | Update a task's title, status, priority, due date or assignee. dueDate/assigneeId = null clears it. |
| `add_comment` | Add a comment to a task as you. |
| `whoami` | Show which taskflow account this connection is signed in as, with counts of workspaces, tasks and notifications. |
| `list_workspaces` | List workspaces you belong to and your role. Archived workspaces are hidden unless includeArchived=true. |
| `list_workspace_members` | List members of a workspace (use their ids to assign tasks). |
| `assign_task` | Set the assignees of a workspace task (replaces existing). Empty list unassigns. |
| `create_project` | Create a project in a workspace (not allowed for viewers). |
| `update_project` | Rename / recolor / describe a project, or archive it (archived=true) / unarchive. Needs project manage rights. |
| `list_sections` | List the sections (board columns) of a project. |
| `create_section` | Add a section to a project. |
| `move_task` | Move a workspace task to another section and/or project. |
| `delete_task` | Move a task to trash (restorable). |
| `list_trash` | List trashed items. Without workspaceId lists your personal trash. |
| `restore_from_trash` | Restore a trashed task or project. Pass workspaceId for workspace items. |
| `list_subtasks` | List subtasks of a task. |
| `create_subtask` | Add a subtask to a task. |
| `update_subtask` | Rename or complete/uncomplete a subtask. |
| `list_comments` | List comments on a task (newest first). |
| `search_tasks` | Full-text search across all tasks you can see (title + description). |
| `list_tags` | List your labels/tags. |
| `set_task_tags` | Set your labels on a task by name (creates missing labels). Empty list clears. |
| `set_recurrence` | Make a task repeat DAILY/WEEKLY/MONTHLY, or null to stop. |
| `list_notifications` | List your notifications (full body, plus the short stored preview) and unread count. |
| `get_notification` | Read one notification with its full body (chat notifications resolve the full message). |
| `mark_notifications_read` | Mark notifications read by ids, or all=true. |
| `get_project` | Get a project with its sections, members and your access. |
| `delete_project` | Move a project to trash (restorable). Needs manage rights. |
| `rename_section` | Rename a project section. |
| `delete_section` | Delete a section (its tasks move to another section). |
| `reorder_sections` | Reorder sections: pass all section ids in the new order. |
| `list_project_members` | List members of a project and their roles. |
| `add_project_member` | Add a workspace member to a project. |
| `update_project_member` | Change a project member's role (memberId from list_project_members). |
| `remove_project_member` | Remove a member from a project. |
| `delete_subtask` | Delete a subtask. |
| `update_comment` | Edit one of your own task comments. |
| `delete_comment` | Delete one of your own task comments. |
| `list_task_activity` | Show a task's activity history (newest first). |
| `list_reminders` | List reminders on a task. |
| `add_reminder` | Add a reminder to a task at an ISO datetime. |
| `delete_reminder` | Delete a task reminder. |
| `get_active_timer` | Show your running/paused timer, if any. |
| `start_timer` | Start a timer on a task (stops any other running timer). |
| `stop_timer` | Stop your running timer. |
| `pause_timer` | Pause your running timer. |
| `resume_timer` | Resume your paused timer. |
| `log_time` | Log time manually on a task for a date (YYYY-MM-DD). |
| `list_time_entries` | List time entries: for a task (taskId) or your own (optionally per workspace), with a report. |
| `update_time_entry` | Edit a time entry's description or duration (minutes). |
| `delete_time_entry` | Delete a time entry. |
| `list_documents` | List docs you can see (personal + workspaces), optionally by workspace or title search. |
| `get_document` | Read a document with its full body. |
| `create_document` | Create a document (personal, or in a workspace). |
| `update_document` | Edit a document's title/body, pin it, or archive it (archived=true). Saves a version. |
| `list_conversations` | List your chats (direct, group, workspace channels) with unread counts. |
| `list_messages` | Read messages in a conversation (newest page; pass cursor for older). |
| `send_message` | Send a chat message as you (optionally as a thread reply via parentId). |
| `edit_message` | Edit one of your chat messages. |
| `delete_message` | Delete one of your chat messages. |
| `react_to_message` | Toggle an emoji reaction on a chat message. |
| `pin_message` | Pin or unpin a chat message. |
| `mark_conversation_read` | Mark a conversation as read. |
| `search_messages` | Search your chat messages. |
| `start_direct_chat` | Open (or find) a direct chat with a user; returns conversationId. |
| `invite_member` | Invite someone to a workspace by email (owner/admin only). |

## 0. Claude mobile / claude.ai (OAuth — easiest)

1. claude.ai (web) → Settings → **Connectors** → **Add custom connector**.
2. Name `Taskflow`, URL `https://<your-taskflow-domain>/api/mcp`. Leave OAuth Client ID/Secret empty → **Add**.
3. Click **Connect** → Taskflow login opens → sign in → **Allow**.
4. The connector syncs to the Claude mobile app automatically (enable it from the chat's tools menu).

How it works (MCP authorization spec):
- `/api/mcp` without a token → `401` + `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/api/mcp"`.
- `/.well-known/oauth-protected-resource[/api/mcp]` and `/.well-known/oauth-authorization-server` publish metadata (CORS enabled).
- `/oauth/register` — Dynamic Client Registration (public clients, `token_endpoint_auth_method: none`).
- `/oauth/authorize` — uses your normal Taskflow login, shows a consent page. PKCE **S256 required**, `redirect_uri` must exactly match a registered one.
- `/oauth/token` — `authorization_code` and `refresh_token` grants. Codes live 5 min and are single-use; access tokens (`tfo_`) live 1 h; refresh tokens (`tfr_`) live 30 days and rotate on every use. Reusing a code or an old refresh token revokes the whole grant.
- `/oauth/revoke` — RFC 7009 revocation.
- Everything is stored as SHA-256 hashes (`OAuthClient`, `OAuthGrant` tables). Set `MCP_PUBLIC_URL` if the public origin differs from the request host.

## 1. Create a token

Settings → **API tokens (Claude / MCP)** → name it (e.g. "Claude") → **Create token**. Copy it immediately — it is shown once. Only a SHA-256 hash is stored. Revoke it from the same card at any time; revoked tokens stop working instantly.

## 2a. Claude Desktop

Claude Desktop → Settings → Developer → **Edit Config** (`claude_desktop_config.json`), then restart Claude:

```json
{
  "mcpServers": {
    "taskflow": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://<your-taskflow-domain>/api/mcp",
        "--header", "Authorization:Bearer ${TASKFLOW_TOKEN}"
      ],
      "env": { "TASKFLOW_TOKEN": "tf_paste_your_token_here" }
    }
  }
}
```

(Requires Node.js. `mcp-remote` bridges Claude Desktop's stdio to the HTTP endpoint.)

## 2b. claude.ai / Claude Desktop custom connector

Settings → **Connectors** → **Add custom connector** → URL `https://<your-taskflow-domain>/api/mcp`.
If your plan's connector dialog lets you set a request header / API key, use `Authorization: Bearer tf_...`.
Custom connectors that only support OAuth can't use the token yet — use the Claude Desktop config above (OAuth support is a planned follow-up).

## 2c. Claude Code / other clients

```bash
claude mcp add --transport http taskflow https://<your-taskflow-domain>/api/mcp \
  --header "Authorization: Bearer tf_..."
```

## Quick test with curl

```bash
curl -s https://<your-taskflow-domain>/api/mcp \
  -H "Authorization: Bearer tf_..." \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Security notes

- Tokens are 256-bit random, prefixed `tf_`, stored hashed; `lastUsedAt` is tracked.
- Max 20 active tokens per user; token creation is rate-limited.
- Missing/invalid/revoked token → HTTP 401 with `WWW-Authenticate: Bearer`.

### Notifications & account check
- `list_notifications` returns the full `body` (chat notifications resolve the full message), plus the stored 80-char `preview` and `truncated`.
- `get_notification(id)` reads one notification in full.
- `whoami` shows the signed-in account and counts (workspaces, archived workspaces, personal/assigned tasks, notifications). Use it when lists look empty: chat notifications don't need any workspace or task, so a chat-only account legitimately has empty task lists.
- `list_workspaces(includeArchived=true)` also shows archived workspaces (hidden by default, which hides their projects/tasks too).

## Connected apps (OAuth)

Settings → **Connected apps** lists every OAuth client that still holds a live access or refresh token for you, with a **Disconnect** button (`DELETE /api/user/oauth-apps/:clientId`) that revokes all of that client's tokens immediately. "Sign out of all devices", changing your password and resetting your password also revoke every OAuth grant, so connectors must re-authorize. Personal `tf_` API tokens are managed separately in the API tokens card.
