import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { moveProjectTask } from "@/lib/projects";
import { projectTaskMoveSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const data = projectTaskMoveSchema.parse(await request.json());
    await moveProjectTask({
      userId: user.id,
      projectId: id,
      taskId: data.taskId,
      sectionId: data.sectionId,
      position: data.position,
    });
    return NextResponse.json({ message: "Moved" });
  } catch (error) {
    return handleApiError(error);
  }
}
