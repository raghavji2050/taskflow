import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { addSampleTasks } from "@/lib/onboarding";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await addSampleTasks(user.id), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
