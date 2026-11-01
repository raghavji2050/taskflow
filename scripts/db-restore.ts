/**
 * Restore a backup made by db-backup into RESTORE_DATABASE_URL.
 *   RESTORE_DATABASE_URL=mysql://root:pw@localhost:3306/todo_app_restore \
 *     npm run db:restore -- --file=backups/x.sql.gz --confirm=todo_app_restore
 * Guarded: refuses PRODUCTION_DB_HOSTS, and remote hosts not in RESTORE_ALLOWED_HOSTS.
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { checkRestoreAllowed, describeConnection, parseDatabaseUrl, restoreArgs } from "../lib/db-backup";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

const list = (v?: string) => (v ?? "").split(",").filter(Boolean);

async function main() {
  const raw = process.env.RESTORE_DATABASE_URL;
  if (!raw) throw new Error("Set RESTORE_DATABASE_URL (deliberately separate from DATABASE_URL)");
  const file = arg("file");
  if (!file || !existsSync(file)) throw new Error("Pass --file=<backup .sql or .sql.gz>");
  const target = parseDatabaseUrl(raw);
  const guard = checkRestoreAllowed({
    target,
    confirm: arg("confirm"),
    allowRemoteHosts: list(process.env.RESTORE_ALLOWED_HOSTS),
    productionHosts: list(process.env.PRODUCTION_DB_HOSTS),
  });
  if (!guard.ok) throw new Error(`Refusing to restore: ${guard.reason}`);

  const bin = process.env.MYSQL_BIN ?? "mysql";
  console.log(`Restoring ${file} -> ${describeConnection(target)}`);
  const child = spawn(bin, restoreArgs(target, process.env.MYSQL_SSL_FLAG), {
    env: { ...process.env, MYSQL_PWD: target.password },
    stdio: ["pipe", "inherit", "inherit"],
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  const source = createReadStream(file);
  if (file.endsWith(".gz")) await pipeline(source, createGunzip(), child.stdin);
  else await pipeline(source, child.stdin);
  const code = await exited;
  if (code !== 0) throw new Error(`${bin} exited with code ${code}`);
  console.log("Restore complete");
}

main().catch((err) => {
  console.error(`Restore failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
