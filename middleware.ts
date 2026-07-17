import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

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

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user?.id;
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
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

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
