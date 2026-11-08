import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/workspace", () => ({ canEditTask: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logTaskActivity: vi.fn() }));

import { dependentsMap, downstreamIds, planDependentShift, MAX_SHIFTED_TASKS } from "@/lib/dependency-shift";
import { shiftedSummary, timelineDependencyEdges } from "@/lib/timeline-arrows";

const DAY = 86_400_000;
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
const node = (id: string, due: string | null, status = "PENDING") => ({ id, dueDate: due ? d(due) : null, status });
const nodes = (...list: ReturnType<typeof node>[]) => new Map(list.map((n) => [n.id, n]));

describe("planDependentShift", () => {
  it("does nothing when the blocker moved earlier or not at all", () => {
    const map = dependentsMap([{ taskId: "b", dependsOnId: "a" }]);
    expect(planDependentShift("a", 0, map, nodes(node("b", "2026-11-10")))).toEqual([]);
    expect(planDependentShift("a", -DAY, map, nodes(node("b", "2026-11-10")))).toEqual([]);
  });

  it("shifts a chain by the same delta, keeping gaps", () => {
    const map = dependentsMap([
      { taskId: "b", dependsOnId: "a" },
      { taskId: "c", dependsOnId: "b" },
    ]);
    const plan = planDependentShift("a", 2 * DAY, map, nodes(node("b", "2026-11-10"), node("c", "2026-11-15")));
    expect(plan.map((p) => [p.id, p.to.toISOString().slice(0, 10)])).toEqual([
      ["b", "2026-11-12"],
      ["c", "2026-11-17"],
    ]);
  });

  it("skips completed and undated tasks and does not push through them", () => {
    const map = dependentsMap([
      { taskId: "b", dependsOnId: "a" },
      { taskId: "c", dependsOnId: "b" },
      { taskId: "x", dependsOnId: "a" },
      { taskId: "y", dependsOnId: "x" },
    ]);
    const plan = planDependentShift("a", DAY, map, nodes(node("b", "2026-11-10", "COMPLETED"), node("c", "2026-11-11"), node("x", null), node("y", "2026-11-12")));
    expect(plan).toEqual([]);
  });

  it("shifts a diamond member only once", () => {
    const map = dependentsMap([
      { taskId: "b", dependsOnId: "a" },
      { taskId: "c", dependsOnId: "a" },
      { taskId: "d", dependsOnId: "b" },
      { taskId: "d", dependsOnId: "c" },
    ]);
    const plan = planDependentShift("a", DAY, map, nodes(node("b", "2026-11-10"), node("c", "2026-11-10"), node("d", "2026-11-12")));
    expect(plan.filter((p) => p.id === "d")).toHaveLength(1);
    expect(plan).toHaveLength(3);
  });

  it("survives a loop in bad data and never shifts the root", () => {
    const map = dependentsMap([
      { taskId: "b", dependsOnId: "a" },
      { taskId: "a", dependsOnId: "b" },
    ]);
    const plan = planDependentShift("a", DAY, map, nodes(node("a", "2026-11-09"), node("b", "2026-11-10")));
    expect(plan.map((p) => p.id)).toEqual(["b"]);
    expect(downstreamIds("a", map)).toEqual(["b"]);
  });

  it("caps how many tasks one change can move", () => {
    const edges = Array.from({ length: MAX_SHIFTED_TASKS + 20 }, (_, i) => ({ taskId: `t${i}`, dependsOnId: "a" }));
    const list = edges.map((e) => node(e.taskId, "2026-11-10"));
    expect(planDependentShift("a", DAY, dependentsMap(edges), nodes(...list))).toHaveLength(MAX_SHIFTED_TASKS);
  });
});

describe("timelineDependencyEdges", () => {
  it("draws blocker -> blocked edges only between dated, visible tasks and flags conflicts", () => {
    const edges = timelineDependencyEdges([
      { id: "a", dueDate: "2026-11-10T00:00:00Z" },
      { id: "b", dueDate: "2026-11-12T00:00:00Z", blockedByIds: ["a"] },
      { id: "c", dueDate: "2026-11-09T00:00:00Z", blockedByIds: ["a", "missing"] },
      { id: "e", dueDate: null, blockedByIds: ["a"] },
    ]);
    expect(edges).toEqual([
      { from: "a", to: "b", conflict: false },
      { from: "a", to: "c", conflict: true },
    ]);
  });

  it("summarises shifted tasks", () => {
    expect(shiftedSummary([])).toBe("");
    expect(shiftedSummary([{ id: "b", title: "Build", from: "", to: "" }])).toContain('"Build"');
    expect(shiftedSummary([{ id: "b", title: "B", from: "", to: "" }, { id: "c", title: "C", from: "", to: "" }])).toContain("2 dependent tasks");
  });
});
