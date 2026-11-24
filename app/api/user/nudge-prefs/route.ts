import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getNudgePrefs, updateNudgePrefs } from "@/lib/active-pm";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ prefs: await getNudgePrefs(user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const prefs = await updateNudgePrefs(user.id, await request.json());
    return NextResponse.json({ prefs });
  } catch (error) {
    return handleApiError(error);
  }
}
