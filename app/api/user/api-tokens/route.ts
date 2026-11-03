import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { generateApiToken, MAX_ACTIVE_TOKENS } from "@/lib/api-tokens";
import { rateLimit } from "@/lib/rate-limit";

const createSchema = z.object({ name: z.string().trim().min(1).max(60) });
const publicFields = { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true } as const;

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tokens = await prisma.apiToken.findMany({
      where: { userId: user.id },
      select: publicFields,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tokens });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!rateLimit(`api-token-create:${user.id}`, 10, 60 * 60_000)) {
      return NextResponse.json({ error: "Too many tokens created, try later" }, { status: 429 });
    }
    const { name } = createSchema.parse(await request.json());
    const active = await prisma.apiToken.count({ where: { userId: user.id, revokedAt: null } });
    if (active >= MAX_ACTIVE_TOKENS) {
      return NextResponse.json({ error: `Limit of ${MAX_ACTIVE_TOKENS} active tokens reached` }, { status: 400 });
    }
    const { token, tokenHash, prefix } = generateApiToken();
    const record = await prisma.apiToken.create({
      data: { name, tokenHash, prefix, userId: user.id },
      select: publicFields,
    });
    // The plain token is returned exactly once.
    return NextResponse.json({ token, apiToken: record }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
