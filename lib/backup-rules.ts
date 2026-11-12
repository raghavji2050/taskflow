/**
 * Pure rules for the off-site DB backup vault (no I/O, unit tested).
 *
 * Backups land in private Vercel Blob under `backups/<source>/<filename>`.
 * Upload flow (bash + curl friendly, file never passes through a function body):
 *   1. POST /api/backups/upload-token  (Bearer TASKFLOW_BACKUP_TOKEN) -> short-lived scoped client token
 *   2. PUT the file straight to Blob with that token
 *   3. POST /api/backups/complete      -> verifies the blob and prunes old backups
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const BACKUP_ROOT = "backups";
export const DEFAULT_SOURCE = "cpdl";
export const DEFAULT_RETENTION = 30;
export const MAX_RETENTION = 365;
/** Hard cap for one upload (client token maximumSizeInBytes). */
export const DEFAULT_MAX_FILE_MB = 200;
/** Keep the whole vault under this so the Hobby 1 GB Blob quota is never hit. */
export const DEFAULT_MAX_TOTAL_MB = 700;
export const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;
export const BACKUP_CONTENT_TYPES = ["application/gzip", "application/x-gzip", "application/octet-stream"] as const;

const SOURCE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** cpdl_YYYY-MM-DD_HHMM.sql.gz, or any safe slug ending in .sql.gz / .gz / .zst */
const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(sql\.gz|gz|sql\.zst|zst)$/;

export class BackupRuleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function normalizeSource(raw: unknown): string {
  const s = typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : DEFAULT_SOURCE;
  if (!SOURCE_RE.test(s)) throw new BackupRuleError("Invalid source (use a short lowercase slug)");
  return s;
}

export function validateFilename(raw: unknown): string {
  if (typeof raw !== "string") throw new BackupRuleError("filename is required");
  const name = raw.trim();
  if (!FILENAME_RE.test(name) || name.includes("..")) {
    throw new BackupRuleError("Invalid filename (expected e.g. cpdl_2026-11-12_0315.sql.gz)");
  }
  return name;
}

export function backupPrefix(source: string) {
  return `${BACKUP_ROOT}/${source}/`;
}

export function backupPathname(source: string, filename: string) {
  return `${backupPrefix(normalizeSource(source))}${validateFilename(filename)}`;
}

/** Parse and validate a full pathname (download/delete); returns null when outside the vault. */
export function parseBackupPathname(raw: unknown): { source: string; filename: string; pathname: string } | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split("/");
  if (parts.length !== 3 || parts[0] !== BACKUP_ROOT) return null;
  try {
    const source = normalizeSource(parts[1]);
    if (source !== parts[1]) return null;
    const filename = validateFilename(parts[2]);
    return { source, filename, pathname: `${BACKUP_ROOT}/${source}/${filename}` };
  } catch {
    return null;
  }
}

/** Date taken from cpdl_YYYY-MM-DD_HHMM in the name (server-local time of the dump), if present. */
export function dumpTimeFromFilename(filename: string): string | null {
  const m = filename.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

function intEnv(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function backupConfig(env: Record<string, string | undefined> = process.env) {
  return {
    retention: intEnv(env.BACKUP_RETENTION, DEFAULT_RETENTION, 1, MAX_RETENTION),
    maxFileBytes: intEnv(env.BACKUP_MAX_FILE_MB, DEFAULT_MAX_FILE_MB, 1, 5000) * 1024 * 1024,
    maxTotalBytes: intEnv(env.BACKUP_MAX_TOTAL_MB, DEFAULT_MAX_TOTAL_MB, 1, 1_000_000) * 1024 * 1024,
  };
}

export function validateSize(raw: unknown, maxFileBytes: number): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new BackupRuleError("size must be a positive integer (bytes)");
  if (n > maxFileBytes) throw new BackupRuleError(`File too large (max ${Math.round(maxFileBytes / 1048576)} MB)`, 413);
  return n;
}

/** Constant-time compare of `Authorization: Bearer <token>` against the configured secret. */
export function isBackupTokenValid(authorization: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !authorization) return false;
  const m = authorization.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  // Hash both sides so lengths match and timing leaks nothing about length.
  const a = createHash("sha256").update(m[1].trim()).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** Backups are visible to emails in BACKUP_ADMIN_EMAILS, plus app-level ADMIN users. */
export function canViewBackups(user: { email?: string | null; role?: string | null } | null | undefined, adminEmails: string[]): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const email = (user.email ?? "").toLowerCase();
  return !!email && adminEmails.includes(email);
}

export type BackupItem = { pathname: string; size: number; uploadedAt: string | Date };

/**
 * Which backups to delete: keep the newest `retention`, and also drop oldest until the
 * total fits `maxTotalBytes`. The newest backup is never deleted.
 */
export function selectBackupsToPrune<T extends BackupItem>(items: T[], retention: number, maxTotalBytes: number): T[] {
  const sorted = [...items].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const keep: T[] = [];
  const prune: T[] = [];
  let total = 0;
  for (const item of sorted) {
    const fits = keep.length === 0 || (keep.length < retention && total + item.size <= maxTotalBytes);
    if (fits) {
      keep.push(item);
      total += item.size;
    } else {
      prune.push(item);
    }
  }
  return prune;
}

/** curl config file (`curl -K file -T backup.sql.gz`) so bash needs no JSON parser. */
export function curlConfig(url: string, headers: Record<string, string>): string {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const lines = [`url = "${esc(url)}"`, `request = "PUT"`];
  for (const [k, v] of Object.entries(headers)) lines.push(`header = "${esc(`${k}: ${v}`)}"`);
  return `${lines.join("\n")}\n`;
}
