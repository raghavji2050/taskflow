import { ok, preflight } from "@/lib/public-api";
import { WEBHOOK_EVENTS } from "@/lib/webhook-rules";

export const OPTIONS = preflight;

export async function GET() {
  return ok({
    name: "TaskFlow REST API",
    version: "v1",
    auth: "Authorization: Bearer tf_… (Settings → API tokens)",
    rateLimit: "120 requests/minute per token",
    endpoints: [
      "GET /api/v1/me",
      "GET /api/v1/workspaces",
      "GET /api/v1/projects?workspaceId=",
      "GET /api/v1/tasks?workspaceId=&projectId=&status=&priority=&search=&dueBefore=&assignedToMe=&includeCompleted=&limit=",
      "POST /api/v1/tasks",
      "GET|PATCH|DELETE /api/v1/tasks/:id",
      "GET|POST /api/v1/workspaces/:id/webhooks",
      "PATCH|DELETE /api/v1/workspaces/:id/webhooks/:webhookId",
      "POST /api/v1/workspaces/:id/webhooks/:webhookId/test",
      "GET /api/v1/workspaces/:id/webhooks/:webhookId/deliveries",
    ],
    webhookEvents: WEBHOOK_EVENTS,
    docs: "https://github.com/raghavji2050/taskflow/blob/main/docs/API.md",
  });
}
