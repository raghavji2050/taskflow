import { json, oauthError, OAuthRequestError, preflight, registerClient } from "@/lib/mcp/oauth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`oauth-register:${ip}`, 20, 60 * 60_000)) return oauthError("too_many_requests", "Slow down", 429);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON");
  }
  try {
    return json(await registerClient(body ?? {}), 201);
  } catch (e) {
    if (e instanceof OAuthRequestError) return oauthError(e.code, e.message);
    throw e;
  }
}
export const OPTIONS = preflight;
