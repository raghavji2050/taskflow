import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import {
  getMeetingMinutesById,
  updateMeetingMinutes,
} from "@/lib/meeting-minutes";
import { coerceMomStructuredContent } from "@/lib/mom-structured";
import { momUpdateSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const mom = await getMeetingMinutesById(id, user.id);
    if (!mom) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ mom });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const data = momUpdateSchema.parse(await request.json());

    const { content, ...rest } = data;
    const mom = await updateMeetingMinutes(id, user.id, {
      ...rest,
      ...(content ? { content: coerceMomStructuredContent(content) } : {}),
    });
    return NextResponse.json({ mom });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return handleApiError(error);
  }
}
