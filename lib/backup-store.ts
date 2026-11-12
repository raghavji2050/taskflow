/**
 * Storage for the DB backup vault: private Vercel Blob in prod, a local folder
 * (outside /public) for dev/CI when BLOB_READ_WRITE_TOKEN is not configured.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { del, get, head, list } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import {
  BACKUP_CONTENT_TYPES,
  BACKUP_ROOT,
  UPLOAD_TOKEN_TTL_MS,
  backupPrefix,
  curlConfig,
  dumpTimeFromFilename,
  parseBackupPathname,
} from "@/lib/backup-rules";

export type StoredBackup = {
  pathname: string;
  source: string;
  filename: string;
  size: number;
  uploadedAt: string;
  dumpTime: string | null;
  /** Internal locator (blob URL or local path). Never sent to the browser. */
  ref: string;
};

export function isBlobBackupStore() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function backupStorageAvailable() {
  return isBlobBackupStore() || process.env.VERCEL !== "1";
}

const BLOB_API_URL = "https://vercel.com/api/blob";
const BLOB_API_VERSION = "12";

function localRoot() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.BACKUP_LOCAL_DIR ?? ".data");
}

function localFile(pathname: string) {
  const parsed = parseBackupPathname(pathname);
  if (!parsed) throw new Error("bad backup pathname");
  return path.join(/*turbopackIgnore: true*/ localRoot(), parsed.pathname);
}

function signingSecret() {
  return process.env.TASKFLOW_BACKUP_TOKEN || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function localSig(pathname: string, exp: number) {
  return createHmac("sha256", signingSecret()).update(`${pathname}\n${exp}`).digest("hex");
}

export function verifyLocalUploadSig(pathname: string, exp: number, sig: string) {
  if (!signingSecret() || !Number.isFinite(exp) || exp < Date.now()) return false;
  const a = Buffer.from(localSig(pathname, exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

function toItem(pathname: string, size: number, uploadedAt: Date, ref: string): StoredBackup | null {
  const parsed = parseBackupPathname(pathname);
  if (!parsed) return null;
  return {
    pathname: parsed.pathname,
    source: parsed.source,
    filename: parsed.filename,
    size,
    uploadedAt: uploadedAt.toISOString(),
    dumpTime: dumpTimeFromFilename(parsed.filename),
    ref,
  };
}

export type UploadTicket = {
  pathname: string;
  method: "PUT";
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
  maxSizeBytes: number;
  curlConfig: string;
};

/** Short-lived ticket that lets a plain curl PUT one file to one exact pathname. */
export async function createUploadTicket(pathname: string, maxSizeBytes: number, origin: string): Promise<UploadTicket> {
  const validUntil = Date.now() + UPLOAD_TOKEN_TTL_MS;
  let uploadUrl: string;
  let headers: Record<string, string>;

  if (isBlobBackupStore()) {
    const token = process.env.BLOB_READ_WRITE_TOKEN!;
    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      maximumSizeInBytes: maxSizeBytes,
      allowedContentTypes: [...BACKUP_CONTENT_TYPES],
      addRandomSuffix: false,
      allowOverwrite: true,
      validUntil,
    });
    const storeId = token.split("_")[3] ?? "";
    uploadUrl = `${BLOB_API_URL}/?${new URLSearchParams({ pathname }).toString()}`;
    headers = {
      authorization: `Bearer ${clientToken}`,
      "x-api-version": BLOB_API_VERSION,
      "x-vercel-blob-store-id": storeId,
      "x-vercel-blob-access": "private",
      "x-content-type": "application/gzip",
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "1",
    };
  } else {
    const sig = localSig(pathname, validUntil);
    uploadUrl = `${origin}/api/backups/local-upload?${new URLSearchParams({ pathname, exp: String(validUntil), sig }).toString()}`;
    headers = { "content-type": "application/gzip" };
  }

  return {
    pathname,
    method: "PUT",
    uploadUrl,
    headers,
    expiresAt: new Date(validUntil).toISOString(),
    maxSizeBytes,
    curlConfig: curlConfig(uploadUrl, headers),
  };
}

export async function writeLocalBackup(pathname: string, body: Buffer) {
  const file = localFile(pathname);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function listBackups(source?: string): Promise<StoredBackup[]> {
  const prefix = source ? backupPrefix(source) : `${BACKUP_ROOT}/`;
  const out: StoredBackup[] = [];

  if (isBlobBackupStore()) {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      for (const b of page.blobs) {
        const item = toItem(b.pathname, b.size, new Date(b.uploadedAt), b.url);
        if (item) out.push(item);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } else {
    const root = localRoot();
    const sources = source ? [source] : await readdir(path.join(/*turbopackIgnore: true*/ root, BACKUP_ROOT)).catch(() => [] as string[]);
    for (const s of sources) {
      const dir = path.join(/*turbopackIgnore: true*/ root, BACKUP_ROOT, s);
      for (const name of await readdir(dir).catch(() => [] as string[])) {
        const full = path.join(/*turbopackIgnore: true*/ dir, name);
        const st = await stat(full).catch(() => null);
        if (!st?.isFile()) continue;
        const item = toItem(`${BACKUP_ROOT}/${s}/${name}`, st.size, st.mtime, full);
        if (item) out.push(item);
      }
    }
  }

  return out.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

export async function findBackup(pathname: string): Promise<StoredBackup | null> {
  const parsed = parseBackupPathname(pathname);
  if (!parsed) return null;
  if (isBlobBackupStore()) {
    const b = await head(parsed.pathname).catch(() => null);
    return b ? toItem(b.pathname, b.size, new Date(b.uploadedAt), b.url) : null;
  }
  const st = await stat(localFile(parsed.pathname)).catch(() => null);
  return st?.isFile() ? toItem(parsed.pathname, st.size, st.mtime, localFile(parsed.pathname)) : null;
}

export async function deleteBackups(items: StoredBackup[]) {
  if (items.length === 0) return;
  if (isBlobBackupStore()) {
    await del(items.map((i) => i.ref));
    return;
  }
  await Promise.all(items.map((i) => rm(localFile(i.pathname), { force: true })));
}

/** Stream the private file; never returns a public URL. */
export async function openBackupStream(item: StoredBackup): Promise<ReadableStream<Uint8Array> | null> {
  if (isBlobBackupStore()) {
    const res = await get(item.ref, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return res.stream as ReadableStream<Uint8Array>;
  }
  return Readable.toWeb(createReadStream(localFile(item.pathname))) as ReadableStream<Uint8Array>;
}

/** Public shape for API/UI (no internal ref). */
export function publicBackup(item: StoredBackup) {
  const { ref: _ref, ...rest } = item;
  void _ref;
  return rest;
}
