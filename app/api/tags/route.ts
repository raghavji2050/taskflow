import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tagSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { visibleTaskWhere } from "@/lib/visible-records";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tags = await prisma.tag.findMany({
      where: { userId: user.id },
      include: { _count: { select: { tasks: { where: { task: visibleTaskWhere() } } } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ tags });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = tagSchema.parse(await request.json());

    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId: user.id, name: data.name } },
      update: {},
      create: { name: data.name, userId: user.id },
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
