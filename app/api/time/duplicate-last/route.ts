import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeDuplicateLastSchema } from "@/lib/validations";
import { duplicateLastTimeEntry } from "@/lib/time-tracking";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = timeDuplicateLastSchema.parse(await request.json().catch(() => ({})));
    const entry = await duplicateLastTimeEntry(user.id, data.taskId);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "No time entries to duplicate") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return handleApiError(error);
  }
}
