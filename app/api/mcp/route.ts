import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiToken } from "@/lib/api-tokens";
import { rateLimit } from "@/lib/rate-limit";
import { createTaskflowMcpServer } from "@/lib/mcp/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 60;

function jsonRpcError(status: number, message: string, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function handle(request: Request) {
  const auth = await authenticateApiToken(request.headers.get("authorization"));
  if (!auth) {
    return jsonRpcError(401, "Missing or invalid taskflow API token", {
      "WWW-Authenticate": 'Bearer realm="taskflow"',
    });
  }
  if (!rateLimit(`mcp:${auth.tokenId}`, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return jsonRpcError(429, "Rate limit exceeded, slow down", { "Retry-After": "60" });
  }

  // Stateless: a fresh server + transport per request (works on serverless).
  const server = createTaskflowMcpServer({ id: auth.user.id, name: auth.user.name });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    logger.error("mcp request failed", { error: String(error) });
    return jsonRpcError(500, "Internal error");
  }
}

export { handle as GET, handle as POST, handle as DELETE };
