import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timePauseSchema } from "@/lib/validations";
import { pauseTimer } from "@/lib/time-tracking";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = timePauseSchema.parse(await request.json());
    const entry = await pauseTimer(user.id, data.timeEntryId, data.reason);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof Error && error.message === "No active timer found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return handleApiError(error);
  }
}
