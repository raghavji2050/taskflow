"use client";

import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { CustomFieldDef } from "@/lib/custom-field-rules";
import { emitCustomFieldsChanged } from "@/lib/custom-field-events";

type Payload = { fields: CustomFieldDef[]; values: { fieldId: string; value: string }[]; canEdit: boolean };

const inputCls =
  "h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60";

/** Project custom fields for one task, shown in the task side panel. Renders nothing when the project has none. */
export function TaskCustomFields({ taskId, readOnly = false }: { taskId: string; readOnly?: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/custom-fields`);
    if (!res.ok) return;
    const next = (await res.json()) as Payload;
    setData(next);
    setDrafts(Object.fromEntries(next.values.map((v) => [v.fieldId, v.value])));
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data || data.fields.length === 0) return null;
  const disabled = readOnly || !data.canEdit;
  const saved = (fieldId: string) => data.values.find((v) => v.fieldId === fieldId)?.value ?? "";

  const save = async (field: CustomFieldDef, value: string) => {
    if (value.trim() === saved(field.id)) return;
    const res = await fetch(`/api/tasks/${taskId}/custom-fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId: field.id, value: value.trim() || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? `Could not save ${field.name}`);
      setDrafts((d) => ({ ...d, [field.id]: saved(field.id) }));
      return;
    }
    const stored: string | null = body.value ?? null;
    setData((prev) =>
      prev
        ? {
            ...prev,
            values: [
              ...prev.values.filter((v) => v.fieldId !== field.id),
              ...(stored === null ? [] : [{ fieldId: field.id, value: stored }]),
            ],
          }
        : prev
    );
    setDrafts((d) => ({ ...d, [field.id]: stored ?? "" }));
    emitCustomFieldsChanged(taskId);
  };

  return (
    <div className="mt-4 border-t border-[var(--card-border)] pt-4" data-testid="task-custom-fields">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Fields
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.fields.map((field) => {
          const value = drafts[field.id] ?? "";
          const label = `${field.name}`;
          return (
            <label key={field.id} className="block text-xs text-[var(--muted)]">
              <span className="mb-1 block">{field.name}</span>
              {field.type === "DROPDOWN" ? (
                <select
                  aria-label={label}
                  className={inputCls}
                  value={value}
                  disabled={disabled}
                  onChange={(e) => {
                    setDrafts((d) => ({ ...d, [field.id]: e.target.value }));
                    void save(field, e.target.value);
                  }}
                >
                  <option value="">—</option>
                  {(field.options ?? []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={label}
                  className={inputCls}
                  type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
                  step={field.type === "NUMBER" ? "any" : undefined}
                  maxLength={field.type === "TEXT" ? 500 : undefined}
                  value={value}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDrafts((d) => ({ ...d, [field.id]: next }));
                    if (field.type === "DATE") void save(field, next);
                  }}
                  onBlur={(e) => { if (field.type !== "DATE") void save(field, e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
