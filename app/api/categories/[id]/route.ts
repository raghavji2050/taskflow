import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { randomBytes } from "crypto";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const data = categorySchema.parse(await request.json());

    const category = await prisma.category.updateMany({
      where: { id, userId: user.id },
      data: { name: data.name, color: data.color },
    });

    if (category.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.category.findUnique({ where: { id } });
    return NextResponse.json({ category: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    await prisma.category.deleteMany({ where: { id, userId: user.id } });
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const token = randomBytes(32).toString("hex");
    const shareExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await prisma.category.updateMany({
      where: { id, userId: user.id },
      data: { shareToken: token, shareExpiry },
    });

    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return NextResponse.json({ shareUrl: `${baseUrl}/share/${token}`, expiresAt: shareExpiry });
  } catch (error) {
    return handleApiError(error);
  }
}
