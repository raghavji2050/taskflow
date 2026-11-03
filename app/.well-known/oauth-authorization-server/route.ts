import { authorizationServerMetadata, getOrigin, json, preflight } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return json(authorizationServerMetadata(getOrigin(request)), 200, { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = preflight;
