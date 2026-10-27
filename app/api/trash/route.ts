import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { listPersonalTrash, purgeTrashItem, restoreTrashItem } from "@/lib/trash";
import { trashActionSchema } from "@/lib/validations";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const items = await listPersonalTrash(user.id);
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = trashActionSchema.parse(await request.json());
    const input = { userId: user.id, workspaceId: null, kind: body.kind, id: body.id };
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
