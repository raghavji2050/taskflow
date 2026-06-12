import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid-token", request.url));
  }

  const verification = await prisma.emailVerificationToken.findUnique({
    where: { token },
  });

  if (!verification || verification.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/login?error=expired-token", request.url));
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verification.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.delete({ where: { id: verification.id } }),
  ]);

  return NextResponse.redirect(new URL("/login?verified=true", request.url));
}
