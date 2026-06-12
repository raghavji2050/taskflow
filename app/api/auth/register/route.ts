import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations";
import { handleApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, verificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!rateLimit(`register:${ip}`, 5, 300_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const data = registerSchema.parse(await request.json());

    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, password: hashedPassword },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    const token = randomBytes(32).toString("hex");
    await prisma.emailVerificationToken.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + 86400_000 * 7) },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    await sendEmail(
      user.email,
      "Verify your TaskFlow email",
      verificationEmail(user.name, `${baseUrl}/api/auth/verify-email?token=${token}`)
    );

    return NextResponse.json({ message: "Account created successfully", user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
