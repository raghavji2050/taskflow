import { getTask, updateTask } from "@/lib/mcp/tools";
import { deleteTask } from "@/lib/mcp/tools-extra";
import { ok, preflight, v1 } from "@/lib/public-api";
import { updateTaskBody } from "@/lib/public-api-schemas";

type Ctx = { params: Promise<{ id: string }> };
export const OPTIONS = preflight;

export const GET = v1<Ctx>(async (user, _r, ctx) => ok(await getTask(user, { taskId: (await ctx.params).id })));

export const PATCH = v1<Ctx>(async (user, request, ctx) => {
  const body = updateTaskBody.parse(await request.json());
  return ok(await updateTask(user, { taskId: (await ctx.params).id, ...body }));
});

export const DELETE = v1<Ctx>(async (user, _r, ctx) => ok(await deleteTask(user, { taskId: (await ctx.params).id })));
