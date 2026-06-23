import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

    if (error instanceof Error) {
    const msg = error.message;
    if (msg === "Forbidden") {
      return jsonError(msg, 403);
    }
    if (
      msg === "You cannot edit messages here" ||
      msg === "You can only edit your own messages" ||
      msg === "Deleted messages cannot be edited" ||
      msg === "Forwarded messages cannot be edited" ||
      msg === "This message cannot be edited" ||
      msg === "This message has no text to edit" ||
      msg.startsWith("Messages can only be edited within")
    ) {
      return jsonError(msg, 400);
    }
    if (msg === "Scheduled message not found" || msg === "Not found") {
      return jsonError(msg, 404);
    }
    if (
      msg === "Message or attachment required" ||
      msg === "Scheduled time is required" ||
      msg.includes("at least 1 minute") ||
      msg.includes("Invalid timezone")
    ) {
      return jsonError(msg, 400);
    }
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function getAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!dbUser) return null;
  return { ...session.user, ...dbUser };
}
