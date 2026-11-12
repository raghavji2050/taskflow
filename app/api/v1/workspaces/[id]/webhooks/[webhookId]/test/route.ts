import { ok, preflight, v1 } from "@/lib/public-api";
import { sendTestPing } from "@/lib/webhooks";

type Ctx = { params: Promise<{ id: string; webhookId: string }> };
export const OPTIONS = preflight;

export const POST = v1<Ctx>(async (user, _r, ctx) => {
  const { id, webhookId } = await ctx.params;
  return ok(await sendTestPing(user.id, id, webhookId));
});
