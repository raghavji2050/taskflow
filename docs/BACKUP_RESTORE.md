# Database backup, restore and staging runbook

Production runs on TiDB Cloud (MySQL-compatible, Singapore) through Prisma. Vercel
functions are pinned to `sin1`. This runbook covers logical backups, a guarded
restore, and keeping preview/staging deployments off the production database.

## 1. Two layers of backup

1. **TiDB Cloud managed backups** — the primary safety net. Check the cluster's
   backup settings and point-in-time restore options in the TiDB Cloud console
   (see the [TiDB Cloud backup docs](https://docs.pingcap.com/tidbcloud/)). A managed
   restore creates a new cluster; it never overwrites the running one.
2. **Logical backups from this repo** — portable `.sql.gz` files you own, useful for
   seeding staging, moving providers (e.g. a future Postgres move), or local debugging.

## 2. Take a logical backup

```bash
# Needs mysqldump/mariadb-dump on PATH. Read-only (--single-transaction).
BACKUP_DATABASE_URL="mysql://user:pass@host:4000/todo_app?sslaccept=strict" npm run db:backup
# -> backups/todo_app-<UTC timestamp>.sql.gz   (backups/ is git-ignored)
```

- The password is passed via `MYSQL_PWD`, never on the command line or in logs.
- Remote hosts get TLS automatically (`--ssl-mode=REQUIRED`). With a MariaDB client set
  `MYSQL_SSL_FLAG=--ssl`.
- Store the file somewhere encrypted and private (it contains user data). Never commit it.

## 3. Restore (guarded)

```bash
RESTORE_DATABASE_URL="mysql://root:password@127.0.0.1:3306/todo_app_restore" \
  npm run db:restore -- --file=backups/todo_app-....sql.gz --confirm=todo_app_restore
```

The script refuses unless all of these hold:

- `--confirm=<database>` matches the target database name.
- The target is local, or its host is listed in `RESTORE_ALLOWED_HOSTS` (comma-separated).
- The target host is **not** in `PRODUCTION_DB_HOSTS`. Set this on any machine that
  holds production credentials so a typo can't overwrite prod.

It reads `RESTORE_DATABASE_URL`, deliberately not `DATABASE_URL`.

### Restore drill (do monthly)

1. `npm run db:backup` against a staging copy (or production, read-only).
2. Restore into a fresh local DB as above.
3. Compare row counts for `User`, `Task`, `Project`, `Workspace`, `_prisma_migrations`.
4. Run `npx prisma migrate status` against the restored DB; it should be up to date.

### Production incident

1. Stop writes if data is being corrupted (Vercel: roll back to the last good deployment).
2. Restore the TiDB managed backup / point-in-time snapshot **into a new cluster**.
3. Verify it, then switch `DATABASE_URL` in Vercel Production to the new cluster and redeploy.
4. Write up what happened.

## 4. Staging / preview database

`npm run vercel-build` runs `prisma migrate deploy`, so **every Preview deployment applies
migrations to whatever `DATABASE_URL` the Preview environment has**. To keep PR previews
from migrating production:

1. Create a separate database (e.g. `todo_app_staging` on the same TiDB cluster, or a
   separate free cluster).
2. In Vercel > Project > Settings > Environment Variables, give `DATABASE_URL` a
   **Preview**-only value pointing at staging; keep the Production value for Production only.
3. Seed staging with `npm run db:seed` or restore a scrubbed backup.
4. Confirm: open a preview's `/api/health` and check it responds `ok`, then check the
   staging DB's `_prisma_migrations` got the PR's migration while production's didn't.

Do not change the `sin1` region, the crons in `vercel.json`, or remove
`prisma migrate deploy` from `vercel-build`.
