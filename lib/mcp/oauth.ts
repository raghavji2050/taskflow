import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const ACCESS_PREFIX = "tfo_";
export const REFRESH_PREFIX = "tfr_";
export const CODE_TTL_MS = 5 * 60_000;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
export const SCOPE = "mcp";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

export function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

export function randomToken(prefix = "") {
  return prefix + randomBytes(32).toString("base64url");
}

/** Public origin of the deployment (respects proxies). */
export function getOrigin(request: Request) {
  if (process.env.MCP_PUBLIC_URL) return process.env.MCP_PUBLIC_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto.split(",")[0]}://${host.split(",")[0]}`;
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Taskflow",
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
  };
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS, ...extra },
  });
}

export function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Redirect URIs must be https, or http on loopback (native clients). No fragments. */
export function isValidRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 1000) return false;
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    // custom schemes for native apps (e.g. cursor://, claude://)
    return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !["javascript:", "data:", "file:"].includes(u.protocol);
  } catch {
    return false;
  }
}

export function verifyPkce(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

export async function registerClient(body: Record<string, unknown>) {
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(isValidRedirectUri)) {
    throw new OAuthRequestError("invalid_redirect_uri", "redirect_uris must be a non-empty list of https URLs");
  }
  const method = body.token_endpoint_auth_method ?? "none";
  if (method !== "none") {
    // We only support public clients (PKCE). Tell the client what we registered.
  }
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : "MCP client";
  const clientId = randomToken("tfc_");
  await prisma.oAuthClient.create({ data: { clientId, name, redirectUris: uris as string[] } });
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export class OAuthRequestError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function getClient(clientId: string | null | undefined) {
  if (!clientId) return null;
  const c = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!c) return null;
  return { ...c, redirectUris: (c.redirectUris as string[]) ?? [] };
}

export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string | null;
  clientName: string;
};

/** Validates an /oauth/authorize request. Errors before redirect_uri is trusted must NOT redirect. */
export async function validateAuthorize(
  q: URLSearchParams
): Promise<{ ok: true; params: AuthorizeParams } | { ok: false; error: string; redirect?: string }> {
  const client = await getClient(q.get("client_id"));
  if (!client) return { ok: false, error: "Unknown client_id. Re-add the connector." };
  const redirectUri = q.get("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!client.redirectUris.includes(redirectUri)) return { ok: false, error: "redirect_uri does not match the registered value." };
  const state = q.get("state");
  const fail = (error: string, desc: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", desc);
    if (state) u.searchParams.set("state", state);
    return { ok: false as const, error: desc, redirect: u.toString() };
  };
  if (q.get("response_type") !== "code") return fail("unsupported_response_type", "response_type must be code");
  const codeChallenge = q.get("code_challenge");
  if (!codeChallenge || q.get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  return {
    ok: true,
    params: {
      clientId: client.clientId,
      redirectUri,
      state,
      codeChallenge,
      scope: SCOPE,
      resource: q.get("resource"),
      clientName: client.name,
    },
  };
}

export async function issueCode(userId: string, p: AuthorizeParams) {
  const code = randomToken("tfac_");
  await prisma.oAuthGrant.create({
    data: {
      kind: "CODE",
      tokenHash: sha256(code),
      clientId: p.clientId,
      userId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scope: p.scope,
      resource: p.resource,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  const u = new URL(p.redirectUri);
  u.searchParams.set("code", code);
  if (p.state) u.searchParams.set("state", p.state);
  return u.toString();
}

async function issueTokens(userId: string, clientId: string, scope: string | null, resource: string | null) {
  const access = randomToken(ACCESS_PREFIX);
  const refresh = randomToken(REFRESH_PREFIX);
  const now = Date.now();
  await prisma.oAuthGrant.createMany({
    data: [
      { kind: "ACCESS", tokenHash: sha256(access), clientId, userId, scope, resource, expiresAt: new Date(now + ACCESS_TTL_S * 1000) },
      { kind: "REFRESH", tokenHash: sha256(refresh), clientId, userId, scope, resource, expiresAt: new Date(now + REFRESH_TTL_MS) },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scope ?? SCOPE };
}

export async function exchangeToken(form: URLSearchParams) {
  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code || !verifier) throw new OAuthRequestError("invalid_request", "code and code_verifier are required");
    const grant = await prisma.oAuthGrant.findUnique({ where: { tokenHash: sha256(code) } });
    if (!grant || grant.kind !== "CODE") throw new OAuthRequestError("invalid_grant", "Invalid code");
    // Single use: atomically mark used.
    const claimed = await prisma.oAuthGrant.updateMany({ where: { id: grant.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) {
      // Replay: revoke everything issued to this client/user pair.
      await prisma.oAuthGrant.updateMany({
        where: { clientId: grant.clientId, userId: grant.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new OAuthRequestError("invalid_grant", "Code already used");
    }
    if (grant.expiresAt.getTime() < Date.now()) throw new OAuthRequestError("invalid_grant", "Code expired");
    if (clientId && clientId !== grant.clientId) throw new OAuthRequestError("invalid_grant", "client_id mismatch");
    const redirectUri = form.get("redirect_uri");
    if (redirectUri && redirectUri !== grant.redirectUri) throw new OAuthRequestError("invalid_grant", "redirect_uri mismatch");
    if (!grant.codeChallenge || !verifyPkce(verifier, grant.codeChallenge)) throw new OAuthRequestError("invalid_grant", "PKCE verification failed");
    return issueTokens(grant.userId, grant.clientId, grant.scope, grant.resource);
  }
  if (grantType === "refresh_token") {
    const token = form.get("refresh_token");
    if (!token) throw new OAuthRequestError("invalid_request", "refresh_token is required");
    const grant = await prisma.oAuthGrant.findUnique({ where: { tokenHash: sha256(token) } });
    if (!grant || grant.kind !== "REFRESH" || grant.revokedAt) throw new OAuthRequestError("invalid_grant", "Invalid refresh token");
    if (clientId && clientId !== grant.clientId) throw new OAuthRequestError("invalid_grant", "client_id mismatch");
    const claimed = await prisma.oAuthGrant.updateMany({ where: { id: grant.id, usedAt: null }, data: { usedAt: new Date(), revokedAt: new Date() } });
    if (claimed.count !== 1) {
      await prisma.oAuthGrant.updateMany({
        where: { clientId: grant.clientId, userId: grant.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new OAuthRequestError("invalid_grant", "Refresh token already used");
    }
    if (grant.expiresAt.getTime() < Date.now()) throw new OAuthRequestError("invalid_grant", "Refresh token expired");
    return issueTokens(grant.userId, grant.clientId, grant.scope, grant.resource);
  }
  throw new OAuthRequestError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
}

export async function revokeToken(token: string) {
  await prisma.oAuthGrant.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function authenticateOAuthToken(header: string | null | undefined) {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m || !m[1].startsWith(ACCESS_PREFIX) || m[1].length > 200) return null;
  const grant = await prisma.oAuthGrant.findUnique({
    where: { tokenHash: sha256(m[1]) },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!grant || grant.kind !== "ACCESS" || grant.revokedAt || grant.expiresAt.getTime() < Date.now()) return null;
  return { tokenId: `oauth:${grant.id}`, user: grant.user };
}
