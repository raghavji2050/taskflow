import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { canAccessTask } from "@/lib/workspace";
import { broadcastTaskEvent } from "@/lib/realtime";
import {
  DependencyError,
  addDependency,
  listDependencies,
  removeDependency,
} from "@/lib/task-dependencies";

type RouteContext = { params: Promise<{ id: string }> };
const bodySchema = z.object({ dependsOnId: z.string().min(1).max(64) });

function fail(error: unknown) {
  if (error instanceof DependencyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return handleApiError(error);
}

/** blockedBy: tasks this one waits on. blocking: tasks waiting on this one. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    if (!(await canAccessTask(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(await listDependencies(id));
  } catch (error) {
    return fail(error);
  }
}

/** Mark this task as blocked by { dependsOnId }. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "dependsOnId is required" }, { status: 400 });
    const result = await addDependency(user.id, id, parsed.data.dependsOnId);
    const task = await canAccessTask(user.id, id);
    if (task) {
      broadcastTaskEvent({ type: "task:updated", workspaceId: task.workspaceId, ownerId: task.userId, actorId: user.id, taskId: id });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

/** Remove a blocker: DELETE ?dependsOnId=... */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const dependsOnId = new URL(request.url).searchParams.get("dependsOnId");
    if (!dependsOnId) return NextResponse.json({ error: "dependsOnId is required" }, { status: 400 });
    return NextResponse.json(await removeDependency(user.id, id, dependsOnId));
  } catch (error) {
    return fail(error);
  }
}
