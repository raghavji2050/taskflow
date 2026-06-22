import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { sendScheduledMessageNow } from "@/lib/scheduled-messages";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const result = await sendScheduledMessageNow(id, user.id, user.name);

    return NextResponse.json({
      scheduledMessage: result.scheduledMessage,
      message: result.message,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
