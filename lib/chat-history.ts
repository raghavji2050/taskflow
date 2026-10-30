/**
 * Decide how opening a conversation should affect browser history.
 * From the list (nothing open) we push so back closes the thread;
 * switching between conversations replaces to avoid a long back stack.
 */
export function conversationNavMode(currentId: string | null): "push" | "replace" {
  return currentId ? "replace" : "push";
}
