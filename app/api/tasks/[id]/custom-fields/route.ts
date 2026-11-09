import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getTaskFieldValues, setTaskFieldValue } from "@/lib/custom-fields";
import { broadcastTaskEvent } from "@/lib/realtime";

type RouteContext = { params: Promise<{ id: string }> };

const putSchema = z.object({
  fieldId: z.string().min(1).max(64),
  value: z.union([z.string().max(500), z.number(), z.null()]),
});

/** The task's project fields plus this task's values. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    return NextResponse.json(await getTaskFieldValues(user.id, id));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Set one field: { fieldId, value } (null or "" clears it). */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const data = putSchema.parse(await request.json());
    const { task, value } = await setTaskFieldValue(user.id, id, data.fieldId, data.value);
    broadcastTaskEvent({ type: "task:updated", workspaceId: task.workspaceId, ownerId: task.userId, actorId: user.id, taskId: id });
    return NextResponse.json({ fieldId: data.fieldId, value });
  } catch (error) {
    return handleApiError(error);
  }
}
