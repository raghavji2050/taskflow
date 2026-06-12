import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations";
import { handleApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, passwordResetEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!rateLimit(`forgot:${ip}`, 5, 300_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { email } = forgotPasswordSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = randomBytes(32).toString("hex");
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.create({
        data: { token, userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
      });

      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      try {
        const result = await sendEmail(
          user.email,
          "Reset your TaskFlow password",
          passwordResetEmail(user.name, resetUrl)
        );

        if (result.dev) {
          return NextResponse.json({
            message: "If that email exists, a reset link was sent",
            devResetUrl: resetUrl,
          });
        }
      } catch {
        return NextResponse.json(
          { error: "Could not send email. Check SMTP settings and try again." },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({ message: "If that email exists, a reset link was sent" });
  } catch (error) {
    return handleApiError(error);
  }
}
