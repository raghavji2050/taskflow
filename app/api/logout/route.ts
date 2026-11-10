import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SIGNED_OUT_COOKIE, SIGNED_OUT_MAX_AGE_SECONDS } from "@/lib/signout-marker";

/**
 * Marks this browser's current sign-in as ended before Auth.js clears the cookie,
 * so a late in-flight response can't bring the session back. See lib/signout-marker.ts.
 */
export async function POST(req: Request) {
  const session = await auth();
  const res = NextResponse.json({ ok: true });
  if (session?.sid) {
    res.cookies.set(SIGNED_OUT_COOKIE, session.sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: SIGNED_OUT_MAX_AGE_SECONDS,
    });
  }
  return res;
}
