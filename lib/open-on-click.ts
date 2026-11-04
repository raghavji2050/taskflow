import type { MouseEvent } from "react";

const INTERACTIVE = "button, a, input, select, textarea, label, [role='button'], [data-no-open]";

/**
 * True when a click on a task card/row should open the task, i.e. it did not
 * land on (or inside) a nested control like a checkbox, status toggle or menu.
 */
export function shouldOpenFromClick(event: MouseEvent<HTMLElement>): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const hit = target.closest(INTERACTIVE);
  return !hit || hit === event.currentTarget;
}
