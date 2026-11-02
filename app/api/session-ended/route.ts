import { NextResponse, type NextRequest } from "next/server";

/**
 * Server pages land here when the JWT cookie is still present but the session was
 * revoked (password change/reset, "sign out of all devices", deleted user).
 * Edge middleware can't see revocation, so without clearing the cookie it would
 * bounce /login -> /dashboard -> /login forever.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  for (const { name } of request.cookies.getAll()) {
    if (/(^|\.)(authjs|next-auth)\.session-token(\.\d+)?$/.test(name)) {
      response.cookies.set(name, "", { maxAge: 0, path: "/", secure: name.startsWith("__Secure-") });
    }
  }
  return response;
}
