import { describe, expect, it } from "vitest";
import {
  isSessionCookieName,
  isSignedOutSession,
  newSessionId,
  stripSessionSetCookies,
} from "@/lib/signout-marker";

describe("signout marker", () => {
  it("matches only the signed-out sign-in", () => {
    expect(isSignedOutSession("a", "a")).toBe(true);
    expect(isSignedOutSession("b", "a")).toBe(false);
    expect(isSignedOutSession(undefined, "a")).toBe(false);
    expect(isSignedOutSession("a", undefined)).toBe(false);
    expect(isSignedOutSession("", "")).toBe(false);
  });

  it("gives each sign-in a fresh id", () => {
    expect(newSessionId()).not.toBe(newSessionId());
  });

  it("recognises Auth.js session cookies, including chunks and __Secure-", () => {
    for (const n of ["authjs.session-token", "__Secure-authjs.session-token", "authjs.session-token.0", "next-auth.session-token"]) {
      expect(isSessionCookieName(n)).toBe(true);
    }
    for (const n of ["authjs.csrf-token", "tf_signed_out_sid", "x.session-token.evil"]) {
      expect(isSessionCookieName(n)).toBe(false);
    }
  });

  it("strips session Set-Cookie headers but keeps the rest", () => {
    const h = new Headers();
    h.append("set-cookie", "authjs.session-token=abc; Path=/; HttpOnly");
    h.append("set-cookie", "authjs.callback-url=x; Path=/");
    h.append("set-cookie", "__Secure-authjs.session-token.1=def; Path=/; Secure");
    stripSessionSetCookies(h);
    expect(h.getSetCookie()).toEqual(["authjs.callback-url=x; Path=/"]);
  });
});
