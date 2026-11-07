import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  emailNotificationPrefsUpdateSchema,
  getEmailNotificationPrefs,
  updateEmailNotificationPrefs,
} from "@/lib/email-notification-prefs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prefs = await getEmailNotificationPrefs(user.id);
    return NextResponse.json({ prefs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = emailNotificationPrefsUpdateSchema.parse(await request.json());
    const prefs = await updateEmailNotificationPrefs(user.id, data);
    return NextResponse.json({ prefs });
  } catch (error) {
    return handleApiError(error);
  }
}
