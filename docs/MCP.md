# Taskflow MCP server

Taskflow exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so Claude (and any MCP client) can read and manage your tasks.

- **Endpoint:** `https://<your-taskflow-domain>/api/mcp` (Streamable HTTP, stateless, JSON responses)
- **Auth:** OAuth 2.1 (claude.ai / Claude mobile / any MCP client — just paste the URL) **or** `Authorization: Bearer tf_...` personal API token
- **Scope:** the token acts as you. It sees only what you can see in the app and obeys workspace/project roles (viewers can't edit or comment).
- **Rate limit:** 60 requests / minute per token.

## Tools

| Tool | What it does |
| --- | --- |
| `list_projects` | Projects you can see, per workspace (optional `workspaceId`) |
| `list_tasks` | Filters: `projectId`, `workspaceId`, `status`, `priority`, `assignedToMe`, `search`, `dueBefore`, `includeCompleted`, `limit` (≤100). Completed tasks hidden by default |
| `get_task` | One task with description, subtasks and the last 20 comments |
| `create_task` | `title` + optional `description`, `projectId`/`workspaceId`, `priority`, `status`, `dueDate`, `assigneeId` |
| `update_task` | `taskId` + any of `title`, `status`, `priority`, `dueDate`, `assigneeId` (`null` clears due date / assignee) |
| `add_comment` | `taskId`, `body` |

| `list_workspaces` / `list_workspace_members` | Your workspaces + roles; members (ids for assigning) |
| `assign_task` | Replace assignees (`assigneeIds`, empty = unassign) |
| `create_project` / `update_project` | Create; rename/recolor/describe or `archived: true/false` (needs manage rights) |
| `list_sections` / `create_section` | Project sections (board columns) |
| `move_task` | Move to another `sectionId` and/or `projectId` |
| `delete_task` / `list_trash` / `restore_from_trash` | Soft delete to trash and restore (task or project) |
| `list_subtasks` / `create_subtask` / `update_subtask` | Subtasks (rename / complete) |
| `list_comments` | All comments on a task |
| `search_tasks` | Search title + description across everything you can see |
| `list_tags` / `set_task_tags` | Your personal labels (by name, auto-created) |
| `set_recurrence` | `DAILY` / `WEEKLY` / `MONTHLY` / `null` |
| `list_notifications` / `mark_notifications_read` | Inbox + unread count; mark by ids or `all` |

All tools use the same RBAC as the app (viewers are read-only, private projects stay hidden). Task dependencies don't exist in the data model yet, so there is no tool for them.

Status: `PENDING`, `IN_PROGRESS`, `COMPLETED`. Priority: `LOW`, `MEDIUM`, `HIGH`. Dates: ISO (`2026-11-10` or full datetime).

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
