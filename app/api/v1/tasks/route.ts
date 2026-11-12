import { createTask, listTasks } from "@/lib/mcp/tools";
import { ok, preflight, v1 } from "@/lib/public-api";
import { createTaskBody, listTasksQuery } from "@/lib/public-api-schemas";

export const OPTIONS = preflight;

export const GET = v1(async (user, request) => {
  const q = listTasksQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await listTasks(user, q));
});

export const POST = v1(async (user, request) => {
  const body = createTaskBody.parse(await request.json());
  return ok(await createTask(user, body), 201);
});
