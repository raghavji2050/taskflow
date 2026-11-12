import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authenticateApiToken } from "@/lib/api-tokens";
import { authenticateOAuthToken } from "@/lib/mcp/oauth";
import { McpToolError } from "@/lib/mcp/tools";
import { ProjectError } from "@/lib/project-sections";
import { WebhookError } from "@/lib/webhooks";
import { rateLimit } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const API_VERSION = "v1";
export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600" };
const RATE_PER_MIN = 120;

export type ApiUser = { id: string; name: string; email: string; via: "token" | "session" };

/** Bearer API token (tf_…) or OAuth token first; the signed-in browser session as a fallback for the web UI. */
export async function apiUser(request: Request): Promise<ApiUser | NextResponse> {
  const header = request.headers.get("authorization");
  if (header) {
    const a = (await authenticateApiToken(header)) ?? (await authenticateOAuthToken(header));
    if (!a) return err(401, "Invalid or revoked token", { "WWW-Authenticate": 'Bearer realm="taskflow", error="invalid_token"' });
    if (!rateLimit(`v1:${a.tokenId}`, RATE_PER_MIN, 60_000)) return err(429, "Rate limit exceeded (120 requests/minute)", { "Retry-After": "60" });
    return { id: a.user.id, name: a.user.name ?? "", email: a.user.email, via: "token" };
  }
  const session = await auth();
  if (session?.user?.id) {
    const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true } });
    if (u) return { id: u.id, name: u.name ?? "", email: u.email, via: "session" };
  }
  return err(401, "Send an API token: Authorization: Bearer tf_… (create one in Settings → API tokens)", { "WWW-Authenticate": 'Bearer realm="taskflow"' });
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { ...CORS, "Cache-Control": "private, no-store", "X-TaskFlow-Api": API_VERSION } });
}

export function err(status: number, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: { status, message } }, { status, headers: { ...CORS, ...headers } });
}

export function apiError(e: unknown) {
  if (e instanceof ZodError) return err(400, e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  if (e instanceof ProjectError || e instanceof WebhookError) return err(e.status, e.message);
  if (e instanceof McpToolError) {
    const m = e.message;
    return err(/not found/i.test(m) ? 404 : /permission|cannot|only|not allowed|forbidden/i.test(m) ? 403 : 400, m);
  }
  if (e instanceof SyntaxError) return err(400, "Body must be JSON");
  console.error("[api/v1]", e);
  return err(500, "Something went wrong");
}

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

/** Wrap a v1 handler: auth + JSON errors. */
export function v1<C>(fn: (user: ApiUser, request: Request, ctx: C) => Promise<Response>) {
  return async (request: Request, ctx: C) => {
    const user = await apiUser(request);
    if (user instanceof NextResponse) return user;
    try {
      return await fn(user, request, ctx);
    } catch (e) {
      return apiError(e);
    }
  };
}
