import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "fs/promises";
import path from "path";
import {
  deleteAttachmentUrl,
  isBlobStorageConfigured,
  uploadAttachment,
} from "@/lib/blob-storage";

describe("blob-storage", () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  afterEach(async () => {
    if (originalToken) {
      process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    } else {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
    await rm(path.join(process.cwd(), "public", "uploads", "test-prefix"), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
  });

  it("reports blob storage as not configured without token", () => {
    expect(isBlobStorageConfigured()).toBe(false);
  });

  it("falls back to local public/uploads when blob token is missing", async () => {
    const saved = await uploadAttachment({
      file: Buffer.from("hello"),
      filename: "note.txt",
      mimeType: "text/plain",
      prefix: "test-prefix",
    });

    expect(saved.url).toMatch(/^\/uploads\/test-prefix\//);
    expect(saved.size).toBe(5);

    await deleteAttachmentUrl(saved.url);
    await mkdir(path.dirname(path.join(process.cwd(), "public", saved.url)), {
      recursive: true,
    }).catch(() => undefined);
  });
});
