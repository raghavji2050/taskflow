import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api";
import { registerUploadedAttachment } from "@/lib/task-attachments-data";
import { attachmentErrorResponse } from "@/lib/task-attachments-http";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({ url: z.string().url().max(1000), filename: z.string().min(1).max(255) });

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const attachment = await registerUploadedAttachment(user.id, id, parsed.data);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return attachmentErrorResponse(error);
  }
}
