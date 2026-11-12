import { listProjects } from "@/lib/mcp/tools";
import { ok, preflight, v1 } from "@/lib/public-api";

export const OPTIONS = preflight;
export const GET = v1(async (user, request) => {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? undefined;
  return ok(await listProjects(user, { workspaceId }));
});
