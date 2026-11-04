import { DEFAULT_QUICK_ADD_TZ, parseQuickAdd } from "@/lib/quick-add";
import type { TaskInput } from "@/lib/validations";

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_QUICK_ADD_TZ;
  } catch {
    return DEFAULT_QUICK_ADD_TZ;
  }
}

/** Turn a one-line quick-add string ("kal 5 baje client call !high") into a task payload. */
export function quickAddToTaskInput(
  text: string,
  opts: { now?: Date; timeZone?: string } = {}
): TaskInput | null {
  const raw = text.trim();
  if (!raw) return null;
  const r = parseQuickAdd(raw, { now: opts.now, timeZone: opts.timeZone ?? browserTimeZone() });
  const title = (r.title || raw).slice(0, 200);
  return {
    title,
    priority: r.priority ?? "MEDIUM",
    status: "PENDING",
    dueDate: r.date ? (r.time ? `${r.date}T${r.time}:00` : r.date) : null,
    assigneeIds: [],
  };
}
