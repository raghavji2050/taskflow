import { ok, preflight, v1 } from "@/lib/public-api";
import { listDeliveries } from "@/lib/webhooks";

type Ctx = { params: Promise<{ id: string; webhookId: string }> };
export const OPTIONS = preflight;

export const GET = v1<Ctx>(async (user, _r, ctx) => {
  const { id, webhookId } = await ctx.params;
  return ok({ deliveries: await listDeliveries(user.id, id, webhookId) });
});
