import type { DocumentType } from "@prisma/client";
import { DOCUMENT_TYPE_LABELS } from "@/lib/document-ui";
import { cn } from "@/lib/utils";

const styles: Record<DocumentType, string> = {
  DOC: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  SOP: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  MEETING_NOTES: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  NOTE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export function DocumentTypeBadge({
  type,
  className,
}: {
  type: DocumentType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        styles[type],
        className
      )}
    >
      {DOCUMENT_TYPE_LABELS[type]}
    </span>
  );
}
