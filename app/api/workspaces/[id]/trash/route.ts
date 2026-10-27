import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { listWorkspaceTrash, purgeTrashItem, restoreTrashItem } from "@/lib/trash";
import { trashActionSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const items = await listWorkspaceTrash(user.id, id);
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const body = trashActionSchema.parse(await request.json());
    const input = { userId: user.id, workspaceId: id, kind: body.kind, id: body.id };
    if (body.action === "restore") {
      await restoreTrashItem(input);
      return NextResponse.json({ message: "Restored" });
    }
    await purgeTrashItem(input);
    return NextResponse.json({ message: "Permanently deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
