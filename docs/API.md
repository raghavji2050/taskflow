# TaskFlow REST API (v1)

Base URL: `https://taskflow-vault.vercel.app/api/v1`

## Auth
Create a token in **Settings → API tokens** and send it on every request:

```
Authorization: Bearer tf_xxxxxxxx
```

The same tokens work for the MCP server (`/api/mcp`). Rate limit: **120 requests / minute / token** (HTTP 429 with `Retry-After`). Errors are JSON: `{ "error": { "status": 404, "message": "Task not found" } }`.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Index of endpoints and webhook events |
| GET | `/me` | The token's user |
| GET | `/workspaces` | Workspaces you belong to (`?includeArchived=true`) |
| GET | `/projects?workspaceId=` | Projects you can see |
| GET | `/tasks` | Filters: `workspaceId`, `projectId`, `status` (PENDING/IN_PROGRESS/COMPLETED), `priority` (LOW/MEDIUM/HIGH), `search`, `dueBefore`, `assignedToMe`, `includeCompleted`, `limit` (≤100) |
| POST | `/tasks` | `{ title, description?, workspaceId?, projectId?, priority?, status?, dueDate?, assigneeId? }` → 201 |
| GET | `/tasks/:id` | Task with subtasks and comments |
| PATCH | `/tasks/:id` | Any of `{ title, status, priority, dueDate, assigneeId, shiftDependents }` |
| DELETE | `/tasks/:id` | Moves to Trash (restorable for 30 days) |
| GET / POST | `/workspaces/:id/webhooks` | Owner/admin. POST `{ url, events? }` → returns `secret` **once** |
| PATCH / DELETE | `/workspaces/:id/webhooks/:webhookId` | PATCH `{ active?, events? }` |
| POST | `/workspaces/:id/webhooks/:webhookId/test` | Sends a signed `ping` |
| GET | `/workspaces/:id/webhooks/:webhookId/deliveries` | Last 20 delivery results |

```bash
curl -H "Authorization: Bearer $TASKFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Call supplier","priority":"HIGH","dueDate":"2026-11-20"}' \
  https://taskflow-vault.vercel.app/api/v1/tasks
```

## Webhooks
Events: `task.created`, `task.updated`, `task.completed`, `task.deleted` (plus `ping` from the test button). URLs must be public `https`. Each delivery is a `POST` with JSON:

```json
{ "id": "<delivery uuid>", "event": "task.completed", "createdAt": "2026-11-12T08:00:00.000Z",
  "data": { "task": { "id": "…", "title": "…", "status": "COMPLETED", "priority": "HIGH", "dueDate": null,
                      "completedAt": "…", "projectId": null, "workspaceId": "…", "sectionId": null,
                      "createdAt": "…", "updatedAt": "…" }, "actorId": "…" } }
```

Headers: `X-TaskFlow-Event`, `X-TaskFlow-Delivery`, `X-TaskFlow-Signature: t=<unix>,v1=<hex>`.

Verify: `v1 == HMAC_SHA256(secret, "<t>.<raw body>")` and reject if `t` is older than 5 minutes.

```js
import { createHmac, timingSafeEqual } from "crypto";
const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const ok = timingSafeEqual(Buffer.from(v1, "hex"), createHmac("sha256", secret).update(`${t}.${rawBody}`).digest()) && Date.now() / 1000 - Number(t) < 300;
```

Reply with any 2xx within 5 seconds. After 10 failures in a row the webhook is turned off (resume it from Team settings).
