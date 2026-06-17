import { describe, it, expect } from "vitest";
import { registerSchema, taskSchema, loginSchema } from "@/lib/validations";

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
});
