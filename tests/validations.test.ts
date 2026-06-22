import { describe, it, expect } from "vitest";
import { registerSchema, taskSchema, loginSchema, scheduledMessageCreateSchema } from "@/lib/validations";

describe("validations", () => {
  it("validates register input", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email on login", () => {
    const result = loginSchema.safeParse({ email: "bad", password: "x" });
    expect(result.success).toBe(false);
  });

  it("validates task with IN_PROGRESS status", () => {
    const result = taskSchema.safeParse({
      title: "My task",
      priority: "HIGH",
      status: "IN_PROGRESS",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty task title", () => {
    const result = taskSchema.safeParse({
      title: "",
      priority: "LOW",
      status: "PENDING",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid estimatedMinutes", () => {
    const result = taskSchema.safeParse({
      title: "Task",
      priority: "MEDIUM",
      status: "PENDING",
      estimatedMinutes: 120,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.estimatedMinutes).toBe(120);
  });

  it("allows null estimatedMinutes", () => {
    const result = taskSchema.safeParse({
      title: "Task",
      priority: "MEDIUM",
      status: "PENDING",
      estimatedMinutes: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero estimatedMinutes", () => {
    const result = taskSchema.safeParse({
      title: "Task",
      priority: "MEDIUM",
      status: "PENDING",
      estimatedMinutes: 0,
    });
    expect(result.success).toBe(false);
  });

  it("validates scheduled message with ISO time", () => {
    const result = scheduledMessageCreateSchema.safeParse({
      conversationId: "conv1",
      body: "Hello",
      scheduledFor: new Date(Date.now() + 3600_000).toISOString(),
      timezone: "UTC",
    });
    expect(result.success).toBe(true);
  });

  it("validates scheduled message with date and time", () => {
    const result = scheduledMessageCreateSchema.safeParse({
      conversationId: "conv1",
      body: "Hello",
      date: "2026-12-01",
      time: "09:00",
      timezone: "Asia/Kolkata",
    });
    expect(result.success).toBe(true);
  });

  it("rejects scheduled message without time fields", () => {
    const result = scheduledMessageCreateSchema.safeParse({
      conversationId: "conv1",
      body: "Hello",
      timezone: "UTC",
    });
    expect(result.success).toBe(false);
  });
});
