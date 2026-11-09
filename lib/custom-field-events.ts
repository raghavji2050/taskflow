/** Browser event fired when a task's custom field value changes, so the project page can refresh. */
export const CUSTOM_FIELDS_CHANGED_EVENT = "taskflow:custom-fields-changed";

export function emitCustomFieldsChanged(taskId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CUSTOM_FIELDS_CHANGED_EVENT, { detail: { taskId } }));
}
