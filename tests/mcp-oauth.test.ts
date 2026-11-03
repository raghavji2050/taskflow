import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  apiToken: { findUnique: vi.fn(), update: vi.fn() },
  oAuthClient: { create: vi.fn(), findUnique: vi.fn() },
  oAuthGrant: { create: vi.fn(), createMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  authenticateOAuthToken,
  authorizationServerMetadata,
  exchangeToken,
  isValidRedirectUri,
  protectedResourceMetadata,
  registerClient,
  sha256,
  validateAuthorize,
  verifyPkce,
  issueCode,
} from "@/lib/mcp/oauth";
import { POST as mcpPost } from "@/app/api/mcp/route";
import { GET as prmGet } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as asGet } from "@/app/.well-known/oauth-authorization-server/route";

const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const verifier = "a".repeat(43) + "bcdefXYZ0123456789-._~";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const client = { clientId: "tfc_1", name: "Claude", redirectUris: [CLAUDE] };

beforeEach(() => {
  for (const m of [db.oAuthClient, db.oAuthGrant, db.apiToken]) for (const f of Object.values(m)) f.mockReset();
  db.oAuthClient.findUnique.mockResolvedValue(client);
  db.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });
  db.oAuthGrant.createMany.mockResolvedValue({ count: 2 });
});

const q = (o: Record<string, string>) => new URLSearchParams(o);
const good = { client_id: "tfc_1", redirect_uri: CLAUDE, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" };

describe("metadata", () => {
  it("advertises resource + authorization server", () => {
    expect(protectedResourceMetadata("https://t.app")).toMatchObject({ resource: "https://t.app/api/mcp", authorization_servers: ["https://t.app"] });
    const as = authorizationServerMetadata("https://t.app");
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.registration_endpoint).toBe("https://t.app/oauth/register");
    expect(as.grant_types_supported).toContain("refresh_token");
  });
  it("well-known routes respond with CORS", async () => {
    const r = await prmGet(new Request("https://t.app/.well-known/oauth-protected-resource/api/mcp"));
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect((await r.json()).resource).toBe("https://t.app/api/mcp");
    expect((await (await asGet(new Request("https://t.app/.well-known/oauth-authorization-server"))).json()).issuer).toBe("https://t.app");
  });
  it("/api/mcp 401 points at resource metadata", async () => {
    const r = await mcpPost(new Request("https://t.app/api/mcp", { method: "POST", body: "{}" }));
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain('resource_metadata="https://t.app/.well-known/oauth-protected-resource/api/mcp"');
  });
});

describe("registration", () => {
  it("validates redirect uris", () => {
    expect(isValidRedirectUri(CLAUDE)).toBe(true);
    expect(isValidRedirectUri("http://localhost:6274/cb")).toBe(true);
    expect(isValidRedirectUri("http://evil.com/cb")).toBe(false);
    expect(isValidRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isValidRedirectUri("https://a.com/cb#x")).toBe(false);
  });
  it("registers a public client", async () => {
    const res = await registerClient({ redirect_uris: [CLAUDE], client_name: "Claude" });
    expect(res.client_id).toMatch(/^tfc_/);
    expect(res.token_endpoint_auth_method).toBe("none");
    expect(db.oAuthClient.create).toHaveBeenCalled();
    await expect(registerClient({ redirect_uris: [] })).rejects.toThrow();
  });
});

describe("authorize", () => {
  it("accepts a valid S256 request", async () => {
    const r = await validateAuthorize(q(good));
    expect(r.ok).toBe(true);
  });
  it("rejects unknown client / mismatched redirect without redirecting", async () => {
    const r = await validateAuthorize(q({ ...good, redirect_uri: "https://claude.ai/other" }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { redirect?: string }).redirect).toBeUndefined();
    db.oAuthClient.findUnique.mockResolvedValue(null);
    expect((await validateAuthorize(q(good))).ok).toBe(false);
  });
  it("requires PKCE S256 (redirects with error)", async () => {
    const r = await validateAuthorize(q({ ...good, code_challenge_method: "plain" }));
    expect(r.ok).toBe(false);
    expect((r as { redirect: string }).redirect).toContain("error=invalid_request");
    expect((r as { redirect: string }).redirect).toContain("state=xyz");
  });
  it("issues a short-lived hashed code", async () => {
    const r = await validateAuthorize(q(good));
    if (!r.ok) throw new Error();
    const url = new URL(await issueCode("u1", r.params));
    const code = url.searchParams.get("code")!;
    expect(url.searchParams.get("state")).toBe("xyz");
    const data = db.oAuthGrant.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(sha256(code));
    expect(data.tokenHash).not.toContain(code);
    expect(data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe("token", () => {
  const codeGrant = { id: "g1", kind: "CODE", clientId: "tfc_1", userId: "u1", redirectUri: CLAUDE, codeChallenge: challenge, scope: "mcp", resource: null, expiresAt: new Date(Date.now() + 60_000) };
  it("verifies pkce", () => {
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce("b".repeat(50), challenge)).toBe(false);
  });
  it("exchanges code for access + refresh", async () => {
    db.oAuthGrant.findUnique.mockResolvedValue(codeGrant);
    const t = await exchangeToken(q({ grant_type: "authorization_code", code: "c", code_verifier: verifier, client_id: "tfc_1", redirect_uri: CLAUDE }));
    expect(t.access_token).toMatch(/^tfo_/);
    expect(t.refresh_token).toMatch(/^tfr_/);
    const rows = db.oAuthGrant.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { kind: string }) => r.kind)).toEqual(["ACCESS", "REFRESH"]);
  });
  it("rejects bad verifier, expired and replayed codes", async () => {
    db.oAuthGrant.findUnique.mockResolvedValue(codeGrant);
    await expect(exchangeToken(q({ grant_type: "authorization_code", code: "c", code_verifier: "z".repeat(43) }))).rejects.toThrow(/PKCE/);
    db.oAuthGrant.findUnique.mockResolvedValue({ ...codeGrant, expiresAt: new Date(0) });
    await expect(exchangeToken(q({ grant_type: "authorization_code", code: "c", code_verifier: verifier }))).rejects.toThrow(/expired/);
    db.oAuthGrant.findUnique.mockResolvedValue(codeGrant);
    db.oAuthGrant.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(exchangeToken(q({ grant_type: "authorization_code", code: "c", code_verifier: verifier }))).rejects.toThrow(/already used/);
  });
  it("rotates refresh tokens and detects reuse", async () => {
    db.oAuthGrant.findUnique.mockResolvedValue({ ...codeGrant, kind: "REFRESH", revokedAt: null });
    const t = await exchangeToken(q({ grant_type: "refresh_token", refresh_token: "r" }));
    expect(t.refresh_token).toMatch(/^tfr_/);
    db.oAuthGrant.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(exchangeToken(q({ grant_type: "refresh_token", refresh_token: "r" }))).rejects.toThrow(/already used/);
    await expect(exchangeToken(q({ grant_type: "password" }))).rejects.toThrow(/grant_type/);
  });
  it("authenticates only live access tokens", async () => {
    const user = { id: "u1", name: "R" };
    db.oAuthGrant.findUnique.mockResolvedValue({ id: "a", kind: "ACCESS", revokedAt: null, expiresAt: new Date(Date.now() + 1000), user });
    expect(await authenticateOAuthToken("Bearer tfo_abc")).toMatchObject({ user });
    expect(await authenticateOAuthToken("Bearer tf_abc")).toBeNull();
    db.oAuthGrant.findUnique.mockResolvedValue({ id: "a", kind: "ACCESS", revokedAt: null, expiresAt: new Date(0), user });
    expect(await authenticateOAuthToken("Bearer tfo_abc")).toBeNull();
    db.oAuthGrant.findUnique.mockResolvedValue({ id: "a", kind: "REFRESH", revokedAt: null, expiresAt: new Date(Date.now() + 1000), user });
    expect(await authenticateOAuthToken("Bearer tfr_abc")).toBeNull();
  });
});
