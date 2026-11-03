import { preflight, revokeToken, CORS_HEADERS } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const token = new URLSearchParams(await request.text()).get("token");
  if (token) await revokeToken(token);
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}
export const OPTIONS = preflight;
