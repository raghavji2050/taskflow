import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeSplitSchema } from "@/lib/validations";
import { splitTimeEntry } from "@/lib/time-tracking";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const data = timeSplitSchema.parse(await request.json());
    const entries = await splitTimeEntry(user.id, id, data.segments);
    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Time entry not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return handleApiError(error);
  }
}
