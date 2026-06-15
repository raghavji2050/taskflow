import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { userSearchSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const { q } = userSearchSchema.parse({ q: searchParams.get("q") ?? "" });

    const users = await prisma.user.findMany({
      where: {
        id: { not: user.id },
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
        ],
      },
      select: { id: true, name: true, email: true, image: true },
      take: 20,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}
