import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeStartSchema } from "@/lib/validations";
import { startTimer } from "@/lib/time-tracking";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = timeStartSchema.parse(await request.json());
    const entry = await startTimer(user.id, data.taskId, data.description, {
      promoteStatus: data.promoteStatus,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Task not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return handleApiError(error);
  }
}
