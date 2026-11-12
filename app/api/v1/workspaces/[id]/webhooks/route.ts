import { ok, preflight, v1 } from "@/lib/public-api";
import { createWebhookBody } from "@/lib/public-api-schemas";
import { createWebhook, listWebhooks } from "@/lib/webhooks";

type Ctx = { params: Promise<{ id: string }> };
export const OPTIONS = preflight;

export const GET = v1<Ctx>(async (user, _r, ctx) => ok({ webhooks: await listWebhooks(user.id, (await ctx.params).id) }));

export const POST = v1<Ctx>(async (user, request, ctx) => {
  const body = createWebhookBody.parse(await request.json());
  return ok(await createWebhook(user.id, (await ctx.params).id, body), 201);
});
