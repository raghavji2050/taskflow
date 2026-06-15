const ACTION_LABELS: Record<string, string> = {
  created: "Task created",
  updated: "Task updated",
  commented: "Comment added",
  assignees_updated: "Assignees updated",
  archived: "Task archived",
  restored: "Task restored",
  status_changed: "Status changed",
};

export function formatActivityAction(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}
