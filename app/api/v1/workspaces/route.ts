import { listWorkspaces } from "@/lib/mcp/tools-extra";
import { ok, preflight, v1 } from "@/lib/public-api";

export const OPTIONS = preflight;
export const GET = v1(async (user, request) => {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  return ok(await listWorkspaces(user, { includeArchived }));
});
