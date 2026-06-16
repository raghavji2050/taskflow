import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getDocumentsForTask } from "@/lib/documents";
import { canAccessTask } from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!(await canAccessTask(user.id, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const documents = await getDocumentsForTask(user.id, id);
    return NextResponse.json({ documents });
  } catch (error) {
    return handleApiError(error);
  }
}
