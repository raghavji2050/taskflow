/**
 * Logical backup of the database in DATABASE_URL (or BACKUP_DATABASE_URL).
 *   npm run db:backup                # writes backups/<db>-<timestamp>.sql.gz
 *   npm run db:backup -- --out=dir   # custom folder
 * Read-only: uses --single-transaction, never writes to the source DB.
 */
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { backupFileName, describeConnection, dumpArgs, parseDatabaseUrl } from "../lib/db-backup";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const raw = process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL (or BACKUP_DATABASE_URL)");
  const conn = parseDatabaseUrl(raw);
  const outDir = arg("out") ?? "backups";
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, backupFileName(conn.database));
  const bin = process.env.MYSQLDUMP_BIN ?? "mysqldump";

  console.log(`Backing up ${describeConnection(conn)} -> ${file}`);
  const child = spawn(bin, dumpArgs(conn, process.env.MYSQL_SSL_FLAG), {
    env: { ...process.env, MYSQL_PWD: conn.password },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  await pipeline(child.stdout, createGzip(), createWriteStream(file));
  const code = await exited;
  if (code !== 0) throw new Error(`${bin} exited with code ${code}`);
  console.log(`Done: ${file} (${statSync(file).size} bytes, gzip)`);
}

main().catch((err) => {
  console.error(`Backup failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
