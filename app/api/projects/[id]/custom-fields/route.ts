import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { createProjectField, listProjectFields } from "@/lib/custom-fields";
import { CUSTOM_FIELD_TYPES } from "@/lib/custom-field-rules";
import { broadcastTaskEvent } from "@/lib/realtime";

type RouteContext = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1, "Field name is required").max(80),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string().max(60)).max(30).optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    return NextResponse.json(await listProjectFields(user.id, id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const data = createSchema.parse(await request.json());
    const { field, workspaceId } = await createProjectField(user.id, id, data);
    broadcastTaskEvent({ type: "task:bulk", workspaceId, ownerId: user.id, actorId: user.id });
    return NextResponse.json({ field }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
