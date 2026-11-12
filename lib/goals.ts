/** Pure goal / OKR math (shared by API, UI and MCP). */
export type GoalStatusName = "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "ACHIEVED";
export const GOAL_STATUSES: GoalStatusName[] = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "ACHIEVED"];
export const GOAL_STATUS_LABEL: Record<GoalStatusName, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  OFF_TRACK: "Off track",
  ACHIEVED: "Achieved",
};
export const MAX_GOAL_LINKS = 100;
export const MAX_GOAL_DEPTH = 3;

export type ProgressPart =
  | { kind: "project"; total: number; done: number }
  | { kind: "task"; completed: boolean }
  | { kind: "goal"; progress: number };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Each linked project, task and sub-goal counts equally. A project with no tasks is skipped.
 * With nothing linked, manualProgress (0-100) is used, else 0.
 */
export function computeGoalProgress(parts: ProgressPart[], manualProgress?: number | null): number {
  const values: number[] = [];
  for (const p of parts) {
    if (p.kind === "project") {
      if (p.total > 0) values.push((p.done / p.total) * 100);
    } else if (p.kind === "task") {
      values.push(p.completed ? 100 : 0);
    } else {
      values.push(p.progress);
    }
  }
  if (values.length === 0) return clamp(manualProgress ?? 0);
  return clamp(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Expected progress if work were spread evenly from start to due date. */
export function expectedProgress(startDate: Date, dueDate: Date | null, now: Date): number | null {
  if (!dueDate) return null;
  const span = dueDate.getTime() - startDate.getTime();
  if (span <= 0) return 100;
  return clamp(((now.getTime() - startDate.getTime()) / span) * 100);
}

export function goalHealth(p: {
  progress: number;
  startDate: Date;
  dueDate: Date | null;
  now: Date;
  statusOverride?: GoalStatusName | null;
}): GoalStatusName {
  if (p.statusOverride) return p.statusOverride;
  if (p.progress >= 100) return "ACHIEVED";
  if (p.dueDate && p.now.getTime() > p.dueDate.getTime()) return "OFF_TRACK";
  const expected = expectedProgress(p.startDate, p.dueDate, p.now);
  if (expected === null) return "ON_TRACK";
  const gap = expected - p.progress;
  if (gap <= 15) return "ON_TRACK";
  if (gap <= 35) return "AT_RISK";
  return "OFF_TRACK";
}

/** Walks parent ids to stop loops and overly deep trees. */
export function wouldCreateGoalCycle(goalId: string, newParentId: string, parentOf: Map<string, string | null>): boolean {
  let cur: string | null | undefined = newParentId;
  let steps = 0;
  while (cur) {
    if (cur === goalId) return true;
    cur = parentOf.get(cur) ?? null;
    if (++steps > 50) return true;
  }
  return false;
}

export function goalDepth(parentId: string | null, parentOf: Map<string, string | null>): number {
  let depth = 0;
  let cur = parentId;
  while (cur && depth < 50) {
    depth += 1;
    cur = parentOf.get(cur) ?? null;
  }
  return depth;
}
