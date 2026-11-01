import { describe, expect, it } from "vitest";
import {
  backupFileName,
  checkRestoreAllowed,
  describeConnection,
  dumpArgs,
  parseDatabaseUrl,
  restoreArgs,
} from "@/lib/db-backup";

describe("parseDatabaseUrl", () => {
  it("parses a TiDB-style URL and enables TLS for remote hosts", () => {
    const c = parseDatabaseUrl(
      "mysql://abc.root:p%40ss@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/todo_app?sslaccept=strict"
    );
    expect(c).toMatchObject({
      host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
      port: 4000,
      user: "abc.root",
      password: "p@ss",
      database: "todo_app",
      ssl: true,
    });
  });

  it("defaults port 3306 and no TLS for localhost", () => {
    const c = parseDatabaseUrl("mysql://root:password@localhost/todo_app");
    expect(c.port).toBe(3306);
    expect(c.ssl).toBe(false);
  });

  it("rejects non-mysql and missing database", () => {
    expect(() => parseDatabaseUrl("postgres://u:p@h/db")).toThrow(/mysql/);
    expect(() => parseDatabaseUrl("mysql://u:p@h:3306/")).toThrow(/database/);
    expect(() => parseDatabaseUrl("nope")).toThrow(/valid URL/);
  });
});

describe("args", () => {
  const remote = parseDatabaseUrl("mysql://u:secret@db.example.com:4000/app");
  it("never puts the password on argv", () => {
    expect(dumpArgs(remote).join(" ")).not.toContain("secret");
    expect(restoreArgs(remote).join(" ")).not.toContain("secret");
    expect(describeConnection(remote)).toBe("u@db.example.com:4000/app");
  });
  it("uses a consistent snapshot and TLS for remote", () => {
    const a = dumpArgs(remote);
    expect(a).toContain("--single-transaction");
    expect(a).toContain("--ssl-mode=REQUIRED");
    expect(a.at(-1)).toBe("app");
    expect(dumpArgs(remote, "--ssl")).toContain("--ssl");
  });
});

describe("backupFileName", () => {
  it("is filesystem safe", () => {
    expect(backupFileName("todo_app", new Date("2026-11-01T01:45:00.123Z"))).toBe(
      "todo_app-2026-11-01T01-45-00Z.sql.gz"
    );
  });
});

describe("checkRestoreAllowed", () => {
  const local = parseDatabaseUrl("mysql://root:pw@127.0.0.1:3306/todo_app_restore");
  const remote = parseDatabaseUrl("mysql://u:pw@gateway01.tidbcloud.com:4000/todo_app");

  it("allows local with matching confirm", () => {
    expect(checkRestoreAllowed({ target: local, confirm: "todo_app_restore" })).toEqual({ ok: true });
  });
  it("requires confirm to match the database", () => {
    expect(checkRestoreAllowed({ target: local }).ok).toBe(false);
    expect(checkRestoreAllowed({ target: local, confirm: "todo_app" }).ok).toBe(false);
  });
  it("blocks remote hosts unless allow-listed", () => {
    expect(checkRestoreAllowed({ target: remote, confirm: "todo_app" }).ok).toBe(false);
    expect(
      checkRestoreAllowed({ target: remote, confirm: "todo_app", allowRemoteHosts: ["gateway01.tidbcloud.com"] }).ok
    ).toBe(true);
  });
  it("always blocks production hosts", () => {
    const r = checkRestoreAllowed({
      target: remote,
      confirm: "todo_app",
      allowRemoteHosts: ["gateway01.tidbcloud.com"],
      productionHosts: ["GATEWAY01.tidbcloud.com"],
    });
    expect(r.ok).toBe(false);
  });
});
