/** Pure getting-started checklist logic (shared by API, UI and tests). */
export type OnboardingFacts = {
  taskCount: number;
  completedCount: number;
  dueDateCount: number;
  teamWorkspaceCount: number;
  teammateCount: number; // other members + pending invites/links across my workspaces
};

export type OnboardingStepId = "first_task" | "due_date" | "complete_task" | "workspace" | "invite";
export type OnboardingStep = { id: OnboardingStepId; label: string; hint: string; done: boolean; href: string };

export const USE_CASES = ["personal", "team"] as const;
export type UseCase = (typeof USE_CASES)[number];

export function onboardingSteps(f: OnboardingFacts, useCase: UseCase | null = null): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    { id: "first_task", label: "Add your first task", hint: "Type it in the quick-add box, e.g. “kal 5 baje call !high”", done: f.taskCount > 0, href: "/dashboard" },
    { id: "due_date", label: "Give a task a due date", hint: "Due dates power reminders, Calendar and Timeline", done: f.dueDateCount > 0, href: "/dashboard/calendar" },
    { id: "complete_task", label: "Tick a task off", hint: "Tap the circle on a task to mark it done", done: f.completedCount > 0, href: "/dashboard" },
  ];
  if (useCase !== "personal") {
    steps.push(
      { id: "workspace", label: "Set up a team workspace", hint: "Share projects, boards and chat with your team", done: f.teamWorkspaceCount > 0, href: "/dashboard/welcome" },
      { id: "invite", label: "Invite a teammate", hint: "Send an email invite or share a join link", done: f.teammateCount > 0, href: "/dashboard/team" }
    );
  }
  return steps;
}

export function onboardingProgress(steps: OnboardingStep[]) {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 100, allDone: done === steps.length };
}

export function parseUseCase(v: unknown): UseCase | null {
  return typeof v === "string" && (USE_CASES as readonly string[]).includes(v) ? (v as UseCase) : null;
}

/** Sample tasks for an empty account (relative due dates, Hinglish-friendly). */
export const SAMPLE_TASK_MARKER = "[sample]";
export function sampleTasks(now = new Date()) {
  const day = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    d.setHours(17, 0, 0, 0);
    return d;
  };
  return [
    { title: "Plan this week’s priorities", priority: "HIGH" as const, status: "PENDING" as const, dueDate: day(0), description: `${SAMPLE_TASK_MARKER} Tip: drag tasks on the Board or press N for a new task.` },
    { title: "Try the Calendar and Timeline views", priority: "MEDIUM" as const, status: "IN_PROGRESS" as const, dueDate: day(2), description: `${SAMPLE_TASK_MARKER} Tasks with due dates show up there automatically.` },
    { title: "Mark this task done ✔", priority: "LOW" as const, status: "PENDING" as const, dueDate: null, description: `${SAMPLE_TASK_MARKER} Tap the circle to complete it. Delete sample tasks any time.` },
  ];
}
