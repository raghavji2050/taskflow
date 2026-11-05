export type StatTask = {
  id: string;
  status: string;
  dueDate: string | null;
  sectionId?: string | null;
  assignees?: { user: { id: string; name: string } }[];
};

/** Local calendar day key (YYYY-MM-DD) for a due date string. Date-only strings stay on that day. */
export function dayKey(due: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  const d = new Date(due);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function projectStats(tasks: StatTask[], sections: { id: string; name: string }[], now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "COMPLETED").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const open = tasks.filter((t) => t.status !== "COMPLETED");
  const overdue = open.filter((t) => t.dueDate && dayKey(t.dueDate) < today).length;
  const dueToday = open.filter((t) => t.dueDate && dayKey(t.dueDate) === today).length;
  const noDate = open.filter((t) => !t.dueDate).length;
  const bySection = sections.map((s) => {
    const list = tasks.filter((t) => t.sectionId === s.id);
    const sDone = list.filter((t) => t.status === "COMPLETED").length;
    return { id: s.id, name: s.name, total: list.length, done: sDone, open: list.length - sDone };
  });
  const people = new Map<string, { name: string; open: number }>();
  for (const t of open) {
    for (const a of t.assignees ?? []) {
      const row = people.get(a.user.id) ?? { name: a.user.name, open: 0 };
      row.open += 1;
      people.set(a.user.id, row);
    }
  }
  const unassigned = open.filter((t) => !t.assignees || t.assignees.length === 0).length;
  return {
    total,
    done,
    inProgress,
    pending: total - done - inProgress,
    percent: total ? Math.round((done / total) * 100) : 0,
    overdue,
    dueToday,
    noDate,
    bySection,
    workload: [...people.values()].sort((a, b) => b.open - a.open),
    unassigned,
  };
}
