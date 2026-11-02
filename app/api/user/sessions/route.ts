import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { revokeAllSessions } from "@/lib/session-version";
import { logger } from "@/lib/logger";

/** Sign out of every device: bumps sessionVersion so all existing JWTs stop working. */
export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await revokeAllSessions(user.id);
    logger.info("auth.sessions_revoked", { userId: user.id, reason: "user_request" });
    return NextResponse.json({ message: "Signed out of all devices" });
  } catch (error) {
    return handleApiError(error);
  }
}
