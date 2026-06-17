import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeQuerySchema } from "@/lib/validations";
import { listUserTimeEntries } from "@/lib/time-tracking";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = timeQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      range: searchParams.get("range") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      taskId: searchParams.get("taskId") ?? undefined,
      personal: searchParams.get("personal") ?? undefined,
      includeReport: searchParams.get("includeReport") ?? undefined,
    });

    const result = await listUserTimeEntries(user.id, userId, query);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handleApiError(error);
  }
}
