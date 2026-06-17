import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeResumePausedSchema } from "@/lib/validations";
import { resumePausedTimer } from "@/lib/time-tracking";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = timeResumePausedSchema.parse(await request.json().catch(() => ({})));
    const entry = await resumePausedTimer(user.id, data.timeEntryId);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof Error && error.message === "No paused timer found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return handleApiError(error);
  }
}
