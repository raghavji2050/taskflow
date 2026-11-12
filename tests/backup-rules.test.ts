import { describe, expect, it } from "vitest";
import {
  BackupRuleError,
  backupConfig,
  backupPathname,
  canViewBackups,
  curlConfig,
  dumpTimeFromFilename,
  isBackupTokenValid,
  normalizeSource,
  parseAdminEmails,
  parseBackupPathname,
  selectBackupsToPrune,
  validateFilename,
  validateSize,
} from "@/lib/backup-rules";

const SECRET = "a".repeat(48);
const MB = 1024 * 1024;

describe("backup filenames", () => {
  it("accepts the cpdl dump pattern and safe slugs", () => {
    expect(validateFilename("cpdl_2026-11-12_0315.sql.gz")).toBe("cpdl_2026-11-12_0315.sql.gz");
    expect(validateFilename("nightly-db.gz")).toBe("nightly-db.gz");
    expect(backupPathname("cpdl", "cpdl_2026-11-12_0315.sql.gz")).toBe("backups/cpdl/cpdl_2026-11-12_0315.sql.gz");
  });
  it("rejects traversal, slashes, wrong extensions and junk", () => {
    for (const bad of ["../x.sql.gz", "a/b.sql.gz", "x.sql", ".hidden.gz", "x..sql.gz", "x y.sql.gz", "", 42, null]) {
      expect(() => validateFilename(bad)).toThrow(BackupRuleError);
    }
  });
  it("validates sources", () => {
    expect(normalizeSource(undefined)).toBe("cpdl");
    expect(normalizeSource("Shop-DB")).toBe("shop-db");
    expect(() => normalizeSource("../x")).toThrow();
  });
  it("parses only vault pathnames", () => {
    expect(parseBackupPathname("backups/cpdl/cpdl_2026-11-12_0315.sql.gz")?.filename).toBe("cpdl_2026-11-12_0315.sql.gz");
    expect(parseBackupPathname("task-attachments/x.gz")).toBeNull();
    expect(parseBackupPathname("backups/cpdl/../../x.gz")).toBeNull();
    expect(parseBackupPathname("backups/CPDL/x.gz")).toBeNull();
    expect(parseBackupPathname(undefined)).toBeNull();
  });
  it("reads the dump time from the name", () => {
    expect(dumpTimeFromFilename("cpdl_2026-11-12_0315.sql.gz")).toBe("2026-11-12 03:15");
    expect(dumpTimeFromFilename("db.gz")).toBeNull();
  });
});

describe("backup token + access", () => {
  it("compares the bearer token in constant time and needs a strong secret", () => {
    expect(isBackupTokenValid(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isBackupTokenValid(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isBackupTokenValid(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isBackupTokenValid(SECRET, SECRET)).toBe(false);
    expect(isBackupTokenValid(null, SECRET)).toBe(false);
    expect(isBackupTokenValid("Bearer short", "short")).toBe(false);
    expect(isBackupTokenValid(`Bearer ${SECRET}`, undefined)).toBe(false);
  });
  it("allows listed emails and app admins only", () => {
    const list = parseAdminEmails(" RJ@Example.com, other@x.io  bad");
    expect(list).toEqual(["rj@example.com", "other@x.io"]);
    expect(canViewBackups({ email: "rj@example.com", role: "USER" }, list)).toBe(true);
    expect(canViewBackups({ email: "x@y.z", role: "ADMIN" }, [])).toBe(true);
    expect(canViewBackups({ email: "x@y.z", role: "USER" }, list)).toBe(false);
    expect(canViewBackups(null, list)).toBe(false);
  });
});

describe("backup config + sizes", () => {
  it("defaults to 30 backups and clamps env", () => {
    expect(backupConfig({}).retention).toBe(30);
    expect(backupConfig({ BACKUP_RETENTION: "7" }).retention).toBe(7);
    expect(backupConfig({ BACKUP_RETENTION: "0" }).retention).toBe(1);
    expect(backupConfig({ BACKUP_RETENTION: "nope" }).retention).toBe(30);
    expect(backupConfig({}).maxFileBytes).toBe(200 * MB);
    expect(backupConfig({}).maxTotalBytes).toBe(700 * MB);
  });
  it("validates sizes", () => {
    expect(validateSize(undefined, MB)).toBeUndefined();
    expect(validateSize("100", MB)).toBe(100);
    expect(() => validateSize(-1, MB)).toThrow();
    expect(() => validateSize(2 * MB, MB)).toThrow(/too large/);
  });
});

describe("retention", () => {
  const day = (n: number, size = 20 * MB) => ({ pathname: `backups/cpdl/d${n}.sql.gz`, size, uploadedAt: new Date(Date.UTC(2026, 10, n)).toISOString() });
  it("keeps the newest N", () => {
    const items = Array.from({ length: 35 }, (_, i) => day(i + 1));
    const prune = selectBackupsToPrune(items, 30, 10_000 * MB);
    expect(prune.map((p) => p.pathname).sort()).toEqual([1, 2, 3, 4, 5].map((n) => `backups/cpdl/d${n}.sql.gz`).sort());
  });
  it("also drops oldest when the size cap is reached, but never the newest", () => {
    const items = [day(1), day(2), day(3)];
    expect(selectBackupsToPrune(items, 30, 45 * MB).map((p) => p.pathname)).toEqual(["backups/cpdl/d1.sql.gz"]);
    expect(selectBackupsToPrune([day(1, 900 * MB)], 30, 10 * MB)).toEqual([]);
  });
});

describe("curl config", () => {
  it("renders a curl -K file with quoted values", () => {
    const cfg = curlConfig("https://x/?pathname=a%2Fb", { authorization: "Bearer t", "x-q": 'a"b' });
    expect(cfg).toBe('url = "https://x/?pathname=a%2Fb"\nrequest = "PUT"\nheader = "authorization: Bearer t"\nheader = "x-q: a\\"b"\n');
  });
});
