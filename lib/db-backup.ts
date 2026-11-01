/**
 * Pure helpers for the logical backup / restore scripts (scripts/db-backup.ts,
 * scripts/db-restore.ts). Kept free of I/O so they can be unit tested.
 */

export interface DbConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

/** MySQL 8 clients; MariaDB clients use "--ssl" (override with MYSQL_SSL_FLAG). */
export const DEFAULT_SSL_FLAG = "--ssl-mode=REQUIRED";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "mysql", "db", "mariadb"]);

/** Parse a Prisma-style mysql:// DATABASE_URL. */
export function parseDatabaseUrl(raw: string): DbConnection {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (url.protocol !== "mysql:") {
    throw new Error(`Only mysql:// URLs are supported (got ${url.protocol})`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL has no database name");
  const sslParam = (url.searchParams.get("sslaccept") ?? url.searchParams.get("ssl") ?? "").toLowerCase();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return {
    host,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    // TiDB Cloud requires TLS; local MySQL/MariaDB usually doesn't have it.
    ssl: sslParam !== "" ? sslParam !== "false" : !isLocalHost(host),
  };
}

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host.toLowerCase());
}

/** Host + db label safe for logs (never includes the password). */
export function describeConnection(c: DbConnection): string {
  return `${c.user ? c.user + "@" : ""}${c.host}:${c.port}/${c.database}`;
}

/** Arguments for mysqldump / mariadb-dump. Password goes via MYSQL_PWD, never argv. */
export function dumpArgs(c: DbConnection, sslFlag = DEFAULT_SSL_FLAG): string[] {
  const args = [
    `--host=${c.host}`,
    `--port=${c.port}`,
    `--user=${c.user}`,
    "--single-transaction",
    "--quick",
    "--no-tablespaces",
    "--skip-lock-tables",
    "--routines",
    "--triggers",
  ];
  if (c.ssl) args.push(sslFlag);
  args.push(c.database);
  return args;
}

/** Arguments for the mysql / mariadb client when restoring. */
export function restoreArgs(c: DbConnection, sslFlag = DEFAULT_SSL_FLAG): string[] {
  const args = [`--host=${c.host}`, `--port=${c.port}`, `--user=${c.user}`];
  if (c.ssl) args.push(sslFlag);
  args.push(c.database);
  return args;
}

/** backups/todo_app-2026-11-01T01-45-00Z.sql.gz */
export function backupFileName(database: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
  return `${database}-${stamp}.sql.gz`;
}

export interface RestoreGuardInput {
  target: DbConnection;
  confirm?: string;
  allowRemoteHosts?: string[];
  productionHosts?: string[];
}

/**
 * Restoring overwrites tables, so refuse unless:
 *  - --confirm=<database name> matches the target database, and
 *  - the target is local, or explicitly allow-listed via RESTORE_ALLOWED_HOSTS, and
 *  - the target is never a host listed in PRODUCTION_DB_HOSTS.
 */
export function checkRestoreAllowed(input: RestoreGuardInput): { ok: true } | { ok: false; reason: string } {
  const { target } = input;
  const host = target.host.toLowerCase();
  const prod = (input.productionHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean);
  const allowed = (input.allowRemoteHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean);

  if (prod.includes(host)) {
    return { ok: false, reason: `${host} is listed in PRODUCTION_DB_HOSTS; restore into a new database/cluster instead` };
  }
  if (!isLocalHost(host) && !allowed.includes(host)) {
    return { ok: false, reason: `${host} is remote; add it to RESTORE_ALLOWED_HOSTS to restore there on purpose` };
  }
  if (input.confirm !== target.database) {
    return { ok: false, reason: `pass --confirm=${target.database} to confirm overwriting that database` };
  }
  return { ok: true };
}
