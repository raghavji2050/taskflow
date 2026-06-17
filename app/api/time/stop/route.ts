import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeStopSchema } from "@/lib/validations";
import { stopTimer } from "@/lib/time-tracking";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = timeStopSchema.parse(await request.json().catch(() => ({})));
    const entry = await stopTimer(user.id, data.timeEntryId, {
      ...("description" in data ? { description: data.description } : {}),
      ...(data.taskStatus ? { taskStatus: data.taskStatus } : {}),
    });
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof Error && error.message === "No active timer found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return handleApiError(error);
  }
}
