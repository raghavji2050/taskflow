import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { removeProjectMember, updateProjectMember } from "@/lib/projects";
import { projectMemberUpdateSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, memberId } = await context.params;
    const data = projectMemberUpdateSchema.parse(await request.json());
    const member = await updateProjectMember(user.id, id, memberId, data.role);
    return NextResponse.json({ member });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, memberId } = await context.params;
    await removeProjectMember(user.id, id, memberId);
    return NextResponse.json({ message: "Member removed" });
  } catch (error) {
    return handleApiError(error);
  }
}
