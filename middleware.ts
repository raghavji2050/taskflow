import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { getOrCreateRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import {
  isSessionCookieName,
  isSignedOutSession,
  SIGNED_OUT_COOKIE,
  stripSessionSetCookies,
} from "@/lib/signout-marker";

const { auth } = NextAuth(authConfig);

/** Internal flag from the auth handler to the outer wrapper; never sent to the browser. */
const SIGNED_OUT_FLAG = "x-tf-signed-out";

const protectedPages = ["/dashboard", "/settings", "/admin"];
const protectedApiPrefixes = [
  "/api/tasks",
  "/api/categories",
  "/api/tags",
  "/api/user",
  "/api/notifications",
  "/api/workspaces/:path*",
  "/api/events",
  "/api/documents",
  "/api/link-preview",
];

const authMiddleware = auth((req) => {
  const signedOut = isSignedOutSession(req.auth?.sid, req.cookies.get(SIGNED_OUT_COOKIE)?.value);
  const isLoggedIn = !!req.auth?.user?.id && !signedOut;
  const response = route(req, isLoggedIn);
  if (signedOut) response.headers.set(SIGNED_OUT_FLAG, "1");
  return response;
});

type AuthedRequest = Parameters<Parameters<typeof auth>[0]>[0];

function route(req: AuthedRequest, isLoggedIn: boolean): NextResponse {
  const { pathname } = req.nextUrl;

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/reset-password");

  const isProtectedPage = protectedPages.some((p) => pathname.startsWith(p));
  const isProtectedApi = protectedApiPrefixes.some((p) => pathname.startsWith(p));
  const isAdminApi = pathname.startsWith("/api/admin");
  const isAdminPage = pathname.startsWith("/admin");

  if ((isProtectedPage || isProtectedApi) && !isLoggedIn) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if ((isAdminPage || isAdminApi) && req.auth?.user?.role !== "ADMIN") {
    if (isAdminApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isAuthPage && isLoggedIn) {
    const next = req.nextUrl.searchParams.get("next");
    const target = next && next.startsWith("/oauth/") ? next : "/dashboard";
    return NextResponse.redirect(new URL(target, req.url));
  }

  const requestId = getOrCreateRequestId(req.headers);
  const forwarded = new Headers(req.headers);
  forwarded.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export default async function middleware(...args: Parameters<typeof authMiddleware>) {
  const res = await authMiddleware(...args);
  if (!(res instanceof Response) || !res.headers.has(SIGNED_OUT_FLAG)) return res;
  // A late response re-signed a session this browser already signed out of: drop it for good.
  res.headers.delete(SIGNED_OUT_FLAG);
  stripSessionSetCookies(res.headers);
  const [req] = args;
  for (const { name } of req.cookies.getAll()) {
    if (isSessionCookieName(name)) {
      res.headers.append(
        "set-cookie",
        `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${name.startsWith("__Secure-") ? "; Secure" : ""}`,
      );
    }
  }
  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/api/tasks/:path*",
    "/api/categories/:path*",
    "/api/tags/:path*",
    "/api/user/:path*",
    "/api/workspaces/:path*",
    "/api/events",
    "/api/documents/:path*",
    "/api/link-preview",
    "/api/admin/:path*",
  ],
};
