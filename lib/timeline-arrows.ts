export type TimelineEdge = { from: string; to: string; conflict: boolean };

/**
 * Blocker -> blocked edges among the tasks drawn on the timeline.
 * conflict = the blocked task is due before its blocker (can't really start in time).
 */
export function timelineDependencyEdges(
  tasks: { id: string; dueDate?: string | Date | null; blockedByIds?: string[] }[]
): TimelineEdge[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const edges: TimelineEdge[] = [];
  for (const t of tasks) {
    for (const blockerId of t.blockedByIds ?? []) {
      const blocker = byId.get(blockerId);
      if (!blocker || blocker.id === t.id || !blocker.dueDate || !t.dueDate) continue;
      edges.push({
        from: blocker.id,
        to: t.id,
        conflict: new Date(t.dueDate).getTime() < new Date(blocker.dueDate).getTime(),
      });
    }
  }
  return edges;
}

export type ShiftedTask = { id: string; title: string; from: string; to: string };

export function shiftedSummary(shifted: ShiftedTask[]) {
  if (shifted.length === 0) return "";
  if (shifted.length === 1) return `Moved "${shifted[0].title}" later to keep it after its blocker`;
  return `Moved ${shifted.length} dependent tasks later to keep them after their blocker`;
}
