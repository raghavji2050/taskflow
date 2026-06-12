import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Parse API/task dates as local calendar days (avoids UTC off-by-one). */
export function toCalendarDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function toDateInputValue(date: string | Date | null | undefined): string {
  const d = toCalendarDate(date);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSameCalendarDay(
  a: string | Date | null | undefined,
  b: Date
): boolean {
  const da = toCalendarDate(a);
  if (!da) return false;
  return (
    da.getFullYear() === b.getFullYear() &&
    da.getMonth() === b.getMonth() &&
    da.getDate() === b.getDate()
  );
}

export function formatDueDate(date: Date | string | null | undefined): string {
  if (!date) return "No due date";

  const parsed = toCalendarDate(date);
  if (!parsed) return "No due date";

  if (isToday(parsed)) return "Today";
  if (isTomorrow(parsed)) return "Tomorrow";

  return format(parsed, "MMM d, yyyy");
}

export function formatRelativeDate(date: Date | string): string {
  const parsed = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(parsed, { addSuffix: true });
}

export function isOverdue(date: Date | string | null | undefined, status: string): boolean {
  if (!date || status === "COMPLETED") return false;
  const parsed = toCalendarDate(date);
  if (!parsed) return false;
  return isPast(parsed) && !isToday(parsed);
}

export function getPriorityClass(priority: string): string {
  switch (priority) {
    case "HIGH":
      return "priority-high";
    case "MEDIUM":
      return "priority-medium";
    case "LOW":
      return "priority-low";
    default:
      return "priority-medium";
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "HIGH":
      return "bg-red-500/10 text-red-600 ring-1 ring-red-500/20 dark:bg-red-500/15 dark:text-red-400";
    case "MEDIUM":
      return "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400";
    case "LOW":
      return "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400";
    default:
      return "bg-zinc-500/10 text-zinc-600 ring-1 ring-zinc-500/20 dark:text-zinc-400";
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400";
    case "IN_PROGRESS":
      return "bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 dark:bg-violet-500/15 dark:text-violet-400";
    default:
      return "bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:bg-sky-500/15 dark:text-sky-400";
  }
}

export function formatDueDateTime(date: Date | string | null | undefined): string {
  if (!date) return "No due date";
  const parsed = typeof date === "string" ? new Date(date) : date;
  const hasTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0;
  if (isToday(parsed)) {
    return hasTime ? `Today at ${format(parsed, "h:mm a")}` : "Today";
  }
  return hasTime ? format(parsed, "MMM d, yyyy h:mm a") : format(parsed, "MMM d, yyyy");
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
