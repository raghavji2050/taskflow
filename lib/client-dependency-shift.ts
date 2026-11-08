import { toast } from "sonner";
import { shiftedSummary, type ShiftedTask } from "@/lib/timeline-arrows";

/** Undo an auto date-shift: put each moved task back (due-date-only PATCH never cascades). */
export async function undoDependentShift(shifted: ShiftedTask[]) {
  const results = await Promise.all(
    shifted.map((s) =>
      fetch(`/api/tasks/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: s.from }),
      })
    )
  );
  return results.every((r) => r.ok);
}

/** Toast "moved N dependent tasks" with an Undo button. Fires a refresh event either way. */
export function announceDependentShift(shifted: ShiftedTask[] | undefined) {
  if (!shifted?.length || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("taskflow:tasks-shifted"));
  toast.success(shiftedSummary(shifted), {
    id: "dependency-shift",
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: () => {
        void undoDependentShift(shifted).then((ok) => {
          window.dispatchEvent(new CustomEvent("taskflow:tasks-shifted"));
          if (ok) toast.success("Dependent dates restored");
          else toast.error("Couldn't restore every date");
        });
      },
    },
  });
}
