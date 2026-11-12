import { ok, preflight, v1 } from "@/lib/public-api";
import { updateWebhookBody } from "@/lib/public-api-schemas";
import { deleteWebhook, updateWebhook } from "@/lib/webhooks";

type Ctx = { params: Promise<{ id: string; webhookId: string }> };
export const OPTIONS = preflight;

export const PATCH = v1<Ctx>(async (user, request, ctx) => {
  const { id, webhookId } = await ctx.params;
  return ok({ webhook: await updateWebhook(user.id, id, webhookId, updateWebhookBody.parse(await request.json())) });
});

export const DELETE = v1<Ctx>(async (user, _r, ctx) => {
  const { id, webhookId } = await ctx.params;
  return ok(await deleteWebhook(user.id, id, webhookId));
});
