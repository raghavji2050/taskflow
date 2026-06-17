const ACTION_LABELS: Record<string, string> = {
  created: "Task created",
  updated: "Task updated",
  commented: "Comment added",
  assignees_updated: "Assignees updated",
  archived: "Task archived",
  restored: "Task restored",
  status_changed: "Status changed",
  time_started: "Timer started",
  time_stopped: "Timer stopped",
  time_manual_added: "Manual time logged",
  time_entry_edited: "Time entry edited",
  time_entry_deleted: "Time entry deleted",
};

export function formatActivityAction(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}
