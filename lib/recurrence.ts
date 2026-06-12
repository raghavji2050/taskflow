import { addDays, addMonths, addWeeks } from "date-fns";

export function getNextDueDate(current: Date, rule: string): Date {
  switch (rule) {
    case "DAILY":
      return addDays(current, 1);
    case "WEEKLY":
      return addWeeks(current, 1);
    case "MONTHLY":
      return addMonths(current, 1);
    default:
      return addDays(current, 1);
  }
}
