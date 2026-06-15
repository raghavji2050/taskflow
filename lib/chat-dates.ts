export function formatConversationListTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "2-digit" } : {}),
  });
}

export function toDateKey(iso: string) {
  return iso.slice(0, 10);
}

export function formatChatDateLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function formatDatePickerLabel(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`);
  const now = new Date();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function groupDatesByMonth(dateKeys: string[]) {
  const map = new Map<string, string[]>();
  for (const key of dateKeys) {
    const month = key.slice(0, 7);
    const list = map.get(month) ?? [];
    list.push(key);
    map.set(month, list);
  }
  return [...map.entries()].map(([month, dates]) => ({
    month,
    label: new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    }),
    dates,
  }));
}
