import { exchangeToken, json, oauthError, OAuthRequestError, preflight } from "@/lib/mcp/oauth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readForm(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await request.text());
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`oauth-token:${ip}`, 60, 60_000)) return oauthError("too_many_requests", "Slow down", 429);
  try {
    return json(await exchangeToken(await readForm(request)));
  } catch (e) {
    if (e instanceof OAuthRequestError) return oauthError(e.code, e.message, e.code === "invalid_client" ? 401 : 400);
    throw e;
  }
}
export const OPTIONS = preflight;
