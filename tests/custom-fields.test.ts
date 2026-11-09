import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanOptions,
  formatFieldValue,
  matchesCustomFieldFilter,
  normalizeFieldValue,
  parseOptions,
  validateFieldDefinition,
  type CustomFieldDef,
} from "@/lib/custom-field-rules";

const db = vi.hoisted(() => ({
  projectCustomField: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
  taskCustomFieldValue: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));
const proj = vi.hoisted(() => ({ requireProjectAccess: vi.fn() }));
const ws = vi.hoisted(() => ({ canAccessTask: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/projects", () => proj);
vi.mock("@/lib/workspace", () => ws);

import * as cf from "@/lib/custom-fields";

const text = { name: "Client", type: "TEXT" as const, options: null };
const num = { name: "Budget", type: "NUMBER" as const, options: null };
const date = { name: "Launch", type: "DATE" as const, options: null };
const drop = { name: "Size", type: "DROPDOWN" as const, options: ["S", "M", "L"] };

describe("field definitions", () => {
  it("requires a name and a known type", () => {
    expect(() => validateFieldDefinition({ name: "  ", type: "TEXT" })).toThrow(/name/);
    expect(() => validateFieldDefinition({ name: "X", type: "COLOR" })).toThrow(/Type/);
  });
  it("dropdown needs options, deduped case-insensitively", () => {
    expect(() => validateFieldDefinition({ name: "Size", type: "DROPDOWN", options: [" "] })).toThrow(/option/);
    expect(validateFieldDefinition({ name: "Size", type: "DROPDOWN", options: ["S", "s", " M ", ""] }).options).toEqual(["S", "M"]);
  });
  it("non-dropdown ignores options", () => {
    expect(validateFieldDefinition({ name: "Budget", type: "NUMBER", options: ["x"] }).options).toBeNull();
  });
  it("parses stored options from JSON or arrays", () => {
    expect(parseOptions('["a","b"]')).toEqual(["a", "b"]);
    expect(parseOptions(["a"])).toEqual(["a"]);
    expect(parseOptions("not json")).toBeNull();
    expect(cleanOptions(null)).toEqual([]);
  });
});

describe("normalizeFieldValue", () => {
  it("clears on null / blank", () => {
    expect(normalizeFieldValue(text, null)).toBeNull();
    expect(normalizeFieldValue(text, "   ")).toBeNull();
  });
  it("numbers", () => {
    expect(normalizeFieldValue(num, "1,500")).toBe("1500");
    expect(normalizeFieldValue(num, 2.5)).toBe("2.5");
    expect(() => normalizeFieldValue(num, "abc")).toThrow(/number/);
  });
  it("dates must be real YYYY-MM-DD", () => {
    expect(normalizeFieldValue(date, "2026-11-09")).toBe("2026-11-09");
    expect(normalizeFieldValue(date, "2026-11-09T10:00:00Z")).toBe("2026-11-09");
    expect(() => normalizeFieldValue(date, "2026-02-30")).toThrow(/date/);
  });
  it("dropdown matches an option case-insensitively", () => {
    expect(normalizeFieldValue(drop, "m")).toBe("M");
    expect(() => normalizeFieldValue(drop, "XL")).toThrow(/one of/);
  });
  it("text has a length cap", () => {
    expect(() => normalizeFieldValue(text, "x".repeat(501))).toThrow(/too long/);
  });
});

describe("formatFieldValue", () => {
  it("formats numbers and dates", () => {
    expect(formatFieldValue("NUMBER", "150000")).toBe("1,50,000");
    expect(formatFieldValue("DATE", "2026-11-09")).toMatch(/Nov/);
    expect(formatFieldValue("TEXT", null)).toBe("");
  });
});

describe("matchesCustomFieldFilter", () => {
  const fields: CustomFieldDef[] = [
    { id: "f1", ...num },
    { id: "f2", ...drop },
    { id: "f3", ...text },
    { id: "f4", ...date },
  ];
  const vals = [
    { fieldId: "f1", value: "100" },
    { fieldId: "f2", value: "M" },
    { fieldId: "f3", value: "Acme Corp" },
    { fieldId: "f4", value: "2026-11-09" },
  ];
  it("no filter / unknown field keeps the task", () => {
    expect(matchesCustomFieldFilter(fields, vals, null)).toBe(true);
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "zz", op: "eq", value: "x" })).toBe(true);
  });
  it("set / empty", () => {
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f1", op: "set" })).toBe(true);
    expect(matchesCustomFieldFilter(fields, [], { fieldId: "f1", op: "empty" })).toBe(true);
    expect(matchesCustomFieldFilter(fields, [], { fieldId: "f1", op: "set" })).toBe(false);
  });
  it("number compares numerically", () => {
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f1", op: "gte", value: "99" })).toBe(true);
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f1", op: "lte", value: "99" })).toBe(false);
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f1", op: "eq", value: "100" })).toBe(true);
  });
  it("dropdown, text and date", () => {
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f2", op: "eq", value: "m" })).toBe(true);
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f2", op: "eq", value: "L" })).toBe(false);
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f3", op: "contains", value: "acme" })).toBe(true);
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f4", op: "gte", value: "2026-11-01" })).toBe(true);
    expect(matchesCustomFieldFilter(fields, vals, { fieldId: "f4", op: "lte", value: "2026-11-01" })).toBe(false);
  });
  it("blank value filter keeps everything", () => {
    expect(matchesCustomFieldFilter(fields, [], { fieldId: "f2", op: "eq", value: "" })).toBe(true);
  });
});

describe("RBAC", () => {
  const access = (canEdit: boolean, canManage: boolean) => ({ canEdit, canManage, project: { workspaceId: "w1" } });
  beforeEach(() => {
    vi.clearAllMocks();
    db.projectCustomField.findMany.mockResolvedValue([]);
  });

  it("only project managers can create or delete fields", async () => {
    proj.requireProjectAccess.mockResolvedValue(access(true, false));
    await expect(cf.createProjectField("u1", "p1", { name: "Budget", type: "NUMBER" })).rejects.toMatchObject({ status: 403 });
    await expect(cf.deleteProjectField("u1", "p1", "f1")).rejects.toMatchObject({ status: 403 });
    expect(db.projectCustomField.create).not.toHaveBeenCalled();
    expect(db.projectCustomField.delete).not.toHaveBeenCalled();
  });

  it("creates a field with next position and refuses duplicate names", async () => {
    proj.requireProjectAccess.mockResolvedValue(access(true, true));
    db.projectCustomField.findMany.mockResolvedValue([{ name: "Client", position: 2 }]);
    db.projectCustomField.create.mockImplementation(({ data }) => Promise.resolve({ id: "f9", ...data }));
    const { field } = await cf.createProjectField("u1", "p1", { name: "Size", type: "DROPDOWN", options: ["S", "M"] });
    expect(field).toMatchObject({ id: "f9", type: "DROPDOWN", options: ["S", "M"], position: 3 });
    await expect(cf.createProjectField("u1", "p1", { name: "client", type: "TEXT" })).rejects.toMatchObject({ status: 409 });
  });

  it("delete only finds fields of this project", async () => {
    proj.requireProjectAccess.mockResolvedValue(access(true, true));
    db.projectCustomField.findFirst.mockResolvedValue(null);
    await expect(cf.deleteProjectField("u1", "p1", "other")).rejects.toMatchObject({ status: 404 });
  });

  it("setting a value needs task access, matching project, and edit rights", async () => {
    ws.canAccessTask.mockResolvedValue(null);
    await expect(cf.setTaskFieldValue("u1", "t1", "f1", "5")).rejects.toMatchObject({ status: 404 });

    ws.canAccessTask.mockResolvedValue({ id: "t1", projectId: "p1", workspaceId: "w1", userId: "u1" });
    db.projectCustomField.findUnique.mockResolvedValue({ id: "f1", projectId: "p2", name: "Budget", type: "NUMBER", options: null, position: 0 });
    await expect(cf.setTaskFieldValue("u1", "t1", "f1", "5")).rejects.toMatchObject({ status: 404 });

    db.projectCustomField.findUnique.mockResolvedValue({ id: "f1", projectId: "p1", name: "Budget", type: "NUMBER", options: null, position: 0 });
    proj.requireProjectAccess.mockResolvedValue(access(false, false));
    await expect(cf.setTaskFieldValue("u1", "t1", "f1", "5")).rejects.toMatchObject({ status: 403 });
    expect(db.taskCustomFieldValue.upsert).not.toHaveBeenCalled();
  });

  it("upserts a normalized value and deletes on clear", async () => {
    ws.canAccessTask.mockResolvedValue({ id: "t1", projectId: "p1", workspaceId: "w1", userId: "u1" });
    db.projectCustomField.findUnique.mockResolvedValue({ id: "f1", projectId: "p1", name: "Budget", type: "NUMBER", options: null, position: 0 });
    proj.requireProjectAccess.mockResolvedValue(access(true, false));
    const r = await cf.setTaskFieldValue("u1", "t1", "f1", "1,200");
    expect(r.value).toBe("1200");
    expect(db.taskCustomFieldValue.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { taskId: "t1", fieldId: "f1", value: "1200" } }));
    await cf.setTaskFieldValue("u1", "t1", "f1", "");
    expect(db.taskCustomFieldValue.deleteMany).toHaveBeenCalledWith({ where: { taskId: "t1", fieldId: "f1" } });
  });

  it("personal tasks have no fields", async () => {
    ws.canAccessTask.mockResolvedValue({ id: "t1", projectId: null });
    expect(await cf.getTaskFieldValues("u1", "t1")).toMatchObject({ fields: [], values: [] });
  });
});
