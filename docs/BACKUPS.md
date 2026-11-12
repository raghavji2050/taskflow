# Off-site DB backup vault

Taskflow stores other servers' database dumps (today: the cpdl MySQL nightly `.sql.gz`) in
**private Vercel Blob** under `backups/<source>/<filename>`. Files never pass through a
Vercel Function body (4.5 MB limit): the server gets a short-lived, single-path client token
and PUTs straight to Blob.

## Env vars (Vercel: production + preview)

| Name | Meaning |
| --- | --- |
| `TASKFLOW_BACKUP_TOKEN` | Secret (≥32 chars) the backup server sends as `Authorization: Bearer …`. |
| `BACKUP_ADMIN_EMAILS` | Comma-separated emails that can open `/dashboard/backups` (app `ADMIN` role always can). |
| `BACKUP_RETENTION` | Keep newest N backups per source (default 30). |
| `BACKUP_MAX_TOTAL_MB` | Vault size cap per source (default 700 MB) so Hobby Blob (1 GB incl. attachments) is never exceeded. |
| `BACKUP_MAX_FILE_MB` | Max single file (default 200 MB). |
| `BLOB_READ_WRITE_TOKEN` | Existing Blob store token. Without it (dev/CI) files go to `./.data/backups/`. |

## Protocol (bash + curl, no jq)

1. `POST /api/backups/upload-token?format=curl` with `Authorization: Bearer $TASKFLOW_BACKUP_TOKEN`
   and JSON `{"filename":"cpdl_2026-11-12_0315.sql.gz","size":20971520,"source":"cpdl"}`.
   Returns a `curl -K` config (URL + headers for one exact pathname, valid 15 min).
   Without `format=curl` the same ticket comes back as JSON `{uploadUrl, method, headers, expiresAt, maxSizeBytes, pathname}`.
2. `curl -K put.cfg -T cpdl_2026-11-12_0315.sql.gz` (PUT straight to Blob).
3. `POST /api/backups/complete` with the same auth + JSON — checks the file exists with the right
   size and prunes old backups (newest `BACKUP_RETENTION` kept, newest is never deleted).

Filenames: `[A-Za-z0-9][A-Za-z0-9._-]*.(sql.gz|gz|sql.zst|zst)`; no slashes or `..`.

Other endpoints (Bearer token **or** an allow-listed signed-in user):

- `GET /api/backups[?source=cpdl]` — list (no blob URLs exposed).
- `GET /api/backups/download?pathname=backups/cpdl/<file>` — streams the private file.
- `DELETE /api/backups?pathname=backups/cpdl/<file>` — remove one backup.
- MCP tool `list_backups` (allow-listed admins).

A ready script lives in the ops notes (`taskflow-backup-upload-snippet.sh`): it reads the token from
`$TASKFLOW_BACKUP_TOKEN` or `/root/.taskflow_backup_token`, uploads the newest dump and exits non-zero on any failure.

## Restore

Download from `/dashboard/backups` (or `curl -H "Authorization: Bearer …" -o x.sql.gz "$URL/api/backups/download?pathname=…"`),
then `gunzip -c x.sql.gz | mysql …` on the target server.
