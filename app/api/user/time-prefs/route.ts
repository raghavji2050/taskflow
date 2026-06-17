import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { timeTrackingPrefsUpdateSchema } from "@/lib/time-tracking-prefs";
import { getTimeTrackingPrefs, updateTimeTrackingPrefs } from "@/lib/time-tracking-prefs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prefs = await getTimeTrackingPrefs(user.id);
    return NextResponse.json({ prefs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = timeTrackingPrefsUpdateSchema.parse(await request.json());
    const prefs = await updateTimeTrackingPrefs(user.id, data);
    return NextResponse.json({ prefs });
  } catch (error) {
    return handleApiError(error);
  }
}
