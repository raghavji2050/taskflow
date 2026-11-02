import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { passwordSchema } from "@/lib/validations";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";

export async function PUT(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = passwordSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });

    if (!user?.password) {
      return NextResponse.json({ error: "OAuth account — set password not available" }, { status: 400 });
    }

    const valid = await bcrypt.compare(data.currentPassword, user.password);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    const hashed = await bcrypt.hash(data.newPassword, 12);
    // Changing the password signs out every device (including this one).
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, sessionVersion: { increment: 1 } },
    });

    return NextResponse.json({ message: "Password updated", signedOut: true });
  } catch (error) {
    return handleApiError(error);
  }
}
