import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  apiToken: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { generateApiToken, hashApiToken, parseBearerToken, authenticateApiToken } from "@/lib/api-tokens";
import { parseDue, McpToolError } from "@/lib/mcp/tools";
import { runTool, createTaskflowMcpServer } from "@/lib/mcp/server";
import { ProjectError } from "@/lib/project-sections";
import { POST } from "@/app/api/mcp/route";

beforeEach(() => {
  db.apiToken.findUnique.mockReset();
  db.apiToken.update.mockReset().mockResolvedValue({});
});

describe("api tokens", () => {
  it("generates unique prefixed tokens and stores only the hash", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.token).toMatch(/^tf_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashApiToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.prefix).toBe(a.token.slice(0, 10));
  });

  it("parses only well-formed bearer tokens", () => {
    const { token } = generateApiToken();
    expect(parseBearerToken(`Bearer ${token}`)).toBe(token);
    expect(parseBearerToken(`bearer ${token}`)).toBe(token);
    expect(parseBearerToken(token)).toBeNull();
    expect(parseBearerToken("Bearer abc")).toBeNull();
    expect(parseBearerToken("Bearer xx_" + "a".repeat(40))).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
  });

  it("rejects revoked and unknown tokens", async () => {
    const { token } = generateApiToken();
    db.apiToken.findUnique.mockResolvedValueOnce(null);
    expect(await authenticateApiToken(`Bearer ${token}`)).toBeNull();
    db.apiToken.findUnique.mockResolvedValueOnce({ id: "t1", revokedAt: new Date(), user: { id: "u1" } });
    expect(await authenticateApiToken(`Bearer ${token}`)).toBeNull();
  });

  it("accepts a live token, looks it up by hash and bumps lastUsedAt", async () => {
    const { token, tokenHash } = generateApiToken();
    db.apiToken.findUnique.mockResolvedValueOnce({ id: "t1", revokedAt: null, lastUsedAt: null, user: { id: "u1", name: "RJ" } });
    const auth = await authenticateApiToken(`Bearer ${token}`);
    expect(auth).toEqual({ tokenId: "t1", user: { id: "u1", name: "RJ" } });
    expect(db.apiToken.findUnique.mock.calls[0][0].where).toEqual({ tokenHash });
    expect(db.apiToken.update).toHaveBeenCalledOnce();
  });
});

describe("mcp helpers", () => {
  it("parses due dates", () => {
    expect(parseDue(undefined)).toBeUndefined();
    expect(parseDue(null)).toBeNull();
    expect(parseDue("2026-11-10")?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(() => parseDue("kal")).toThrow(McpToolError);
  });

  it("turns permission errors into tool errors and rethrows the rest", async () => {
    expect(await runTool(async () => ({ ok: 1 }))).toEqual({ content: [{ type: "text", text: '{\n  "ok": 1\n}' }] });
    expect(await runTool(async () => { throw new McpToolError("Task not found"); })).toMatchObject({ isError: true });
    expect(await runTool(async () => { throw new ProjectError("Forbidden", 403); })).toMatchObject({ isError: true });
    await expect(runTool(async () => { throw new Error("db down"); })).rejects.toThrow("db down");
  });

  it("builds a server", () => {
    expect(createTaskflowMcpServer({ id: "u1", name: "RJ" })).toBeTruthy();
  });
});

function rpc(body: unknown, auth?: string) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("/api/mcp", () => {
  it("returns 401 without a token", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("lists the core tools for a valid token", async () => {
    const { token } = generateApiToken();
    db.apiToken.findUnique.mockResolvedValue({ id: "tok-list", revokedAt: null, lastUsedAt: new Date(), user: { id: "u1", name: "RJ" } });
    const init = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, `Bearer ${token}`)
    );
    expect(init.status).toBe(200);
    const res = await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, `Bearer ${token}`));
    const json = await res.json();
    expect(json.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(expect.arrayContaining(
      ["add_comment", "create_task", "get_task", "list_projects", "list_tasks", "update_task"])
    );
  });

  it("rate-limits per token", async () => {
    const { token } = generateApiToken();
    db.apiToken.findUnique.mockResolvedValue({ id: "tok-rl", revokedAt: null, lastUsedAt: new Date(), user: { id: "u1", name: "RJ" } });
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await POST(rpc({ jsonrpc: "2.0", id: i, method: "tools/list" }, `Bearer ${token}`))).status;
    expect(last).toBe(429);
  });
});
