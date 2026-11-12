import { describe, expect, it } from "vitest";
import { checkWebhookUrl, isPrivateIp, parseEvents, secretHint, signPayload, verifySignature, generateWebhookSecret } from "@/lib/webhook-rules";

describe("webhook rules", () => {
  it("parses events", () => {
    expect(parseEvents(["task.created", "nope", "task.created"])).toEqual(["task.created"]);
    expect(parseEvents("task.updated, task.deleted")).toEqual(["task.updated", "task.deleted"]);
    expect(parseEvents([])).toBeNull();
    expect(parseEvents(5)).toBeNull();
  });
  it("signs and verifies (with replay window)", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_/);
    const body = '{"a":1}';
    const sig = signPayload(secret, body, 1_800_000_000);
    expect(sig).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature(secret, body, sig, 300, 1_800_000_100)).toBe(true);
    expect(verifySignature(secret, body + " ", sig, 300, 1_800_000_100)).toBe(false);
    expect(verifySignature("whsec_other", body, sig, 300, 1_800_000_100)).toBe(false);
    expect(verifySignature(secret, body, sig, 300, 1_800_001_000)).toBe(false);
    expect(secretHint(secret)).toMatch(/^whsec_.{4}….{4}$/);
  });
  it("blocks private and non-https URLs unless allowed", () => {
    expect(checkWebhookUrl("https://hooks.example.com/x").ok).toBe(true);
    for (const bad of ["http://hooks.example.com", "https://localhost/x", "https://10.0.0.5/x", "https://192.168.1.2", "https://[::1]/", "https://169.254.169.254/latest", "https://user:pw@example.com", "https://intranet/", "ftp://example.com", "nope"]) {
      expect(checkWebhookUrl(bad).ok, bad).toBe(false);
    }
    expect(checkWebhookUrl("http://127.0.0.1:4000/hook", true).ok).toBe(true);
    expect(isPrivateIp("172.20.1.1")).toBe(true);
    expect(isPrivateIp("172.32.1.1")).toBe(false);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("::ffff:10.1.2.3")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
  });
});
