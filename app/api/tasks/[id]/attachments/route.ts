import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const task = await prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploadDir = path.join(process.cwd(), "public", "uploads", user.id);
    await mkdir(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);

    const attachment = await prisma.attachment.create({
      data: {
        filename: file.name,
        url: `/uploads/${user.id}/${filename}`,
        mimeType: file.type || "application/octet-stream",
        size: buffer.length,
        taskId: id,
      },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
