import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENTS_PER_TASK,
  MAX_TASK_ATTACHMENT_BYTES,
  cleanAttachmentFilename,
  isPathForTask,
  validateTaskAttachment,
} from "@/lib/task-attachment-rules";

describe("task attachment rules", () => {
  it("accepts a normal file", () => {
    expect(validateTaskAttachment({ filename: "brief.pdf", size: 1000, existingCount: 0 })).toBeNull();
  });
  it("rejects empty, too big and too many files", () => {
    expect(validateTaskAttachment({ filename: "a.txt", size: 0, existingCount: 0 })).toMatch(/empty/);
    expect(validateTaskAttachment({ filename: "a.mov", size: MAX_TASK_ATTACHMENT_BYTES + 1, existingCount: 0 })).toMatch(/25 MB/);
    expect(validateTaskAttachment({ filename: "a.txt", size: 10, existingCount: MAX_ATTACHMENTS_PER_TASK })).toMatch(/at most 50/);
    expect(validateTaskAttachment({ filename: "a.txt", size: 5 * 1024 * 1024, existingCount: 0, maxBytes: 4 * 1024 * 1024 })).toMatch(/4 MB/);
  });
  it("blocks executables", () => {
    expect(validateTaskAttachment({ filename: "setup.EXE", size: 10, existingCount: 0 })).toMatch(/\.exe/);
    expect(validateTaskAttachment({ filename: "notes.exe.txt", size: 10, existingCount: 0 })).toBeNull();
  });
  it("cleans filenames", () => {
    expect(cleanAttachmentFilename("C:\\Users\\me\\photo.png")).toBe("photo.png");
    expect(cleanAttachmentFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanAttachmentFilename("  ")).toBe("file");
    expect(cleanAttachmentFilename("x".repeat(300)).length).toBe(200);
  });
  it("only accepts blob paths inside the task folder", () => {
    expect(isPathForTask("tasks/t1/brief-abc.pdf", "t1")).toBe(true);
    expect(isPathForTask("tasks/t2/brief.pdf", "t1")).toBe(false);
    expect(isPathForTask("tasks/t1/../t2/x", "t1")).toBe(false);
    expect(isPathForTask("tasks/t10/x", "t1")).toBe(false);
  });
});
