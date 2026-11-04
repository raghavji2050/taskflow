import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessTask } from "@/lib/workspace";
import { followTask, listTaskFollowers, unfollowTask } from "@/lib/task-followers";

type RouteContext = { params: Promise<{ id: string }> };

async function respond(taskId: string, userId: string, status = 200) {
  const followers = await listTaskFollowers(taskId);
  return NextResponse.json(
    { followers, following: followers.some((f) => f.id === userId) },
    { status }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    if (!(await canAccessTask(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return respond(id, user.id);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Follow the task yourself (viewers too: following is read-only). */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    if (!(await canAccessTask(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await followTask(id, [user.id]);
    return respond(id, user.id);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    if (!(await canAccessTask(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await unfollowTask(id, user.id);
    return respond(id, user.id);
  } catch (error) {
    return handleApiError(error);
  }
}
