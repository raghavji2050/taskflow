import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeQuerySchema } from "@/lib/validations";
import { listWorkspaceTimeEntries } from "@/lib/time-tracking";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = timeQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      range: searchParams.get("range") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      userId: searchParams.get("userId") ?? undefined,
      taskId: searchParams.get("taskId") ?? undefined,
      includeReport: searchParams.get("includeReport") ?? undefined,
    });

    const result = await listWorkspaceTimeEntries(user.id, workspaceId, query);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return handleApiError(error);
  }
}
