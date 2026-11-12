import { describe, expect, it } from "vitest";
import { onboardingProgress, onboardingSteps, parseUseCase, sampleTasks, SAMPLE_TASK_MARKER } from "@/lib/onboarding-rules";

const empty = { taskCount: 0, completedCount: 0, dueDateCount: 0, teamWorkspaceCount: 0, teammateCount: 0 };

describe("onboarding checklist", () => {
  it("new account: nothing done, team steps shown unless personal", () => {
    expect(onboardingSteps(empty).map((s) => s.id)).toEqual(["first_task", "due_date", "complete_task", "workspace", "invite"]);
    expect(onboardingSteps(empty, "personal").map((s) => s.id)).toEqual(["first_task", "due_date", "complete_task"]);
    expect(onboardingProgress(onboardingSteps(empty))).toEqual({ done: 0, total: 5, percent: 0, allDone: false });
  });
  it("progress follows facts", () => {
    const steps = onboardingSteps({ ...empty, taskCount: 3, dueDateCount: 2 });
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["first_task", "due_date"]);
    expect(onboardingProgress(steps).percent).toBe(40);
    const all = onboardingSteps({ taskCount: 1, completedCount: 1, dueDateCount: 1, teamWorkspaceCount: 1, teammateCount: 1 });
    expect(onboardingProgress(all).allDone).toBe(true);
    expect(onboardingProgress(onboardingSteps({ ...empty, taskCount: 1, completedCount: 1, dueDateCount: 1 }, "personal")).allDone).toBe(true);
  });
  it("parses use case and builds marked sample tasks", () => {
    expect(parseUseCase("team")).toBe("team");
    expect(parseUseCase("x")).toBeNull();
    const t = sampleTasks(new Date("2026-11-12T10:00:00"));
    expect(t).toHaveLength(3);
    expect(t.every((x) => x.description.startsWith(SAMPLE_TASK_MARKER))).toBe(true);
    expect(t.filter((x) => x.dueDate).length).toBe(2);
  });
});
