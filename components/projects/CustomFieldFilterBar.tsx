"use client";

import { Filter, X } from "lucide-react";
import type { CustomFieldDef, CustomFieldFilter } from "@/lib/custom-field-rules";

const ctl =
  "h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none";

function opsFor(field: CustomFieldDef): { value: CustomFieldFilter["op"]; label: string }[] {
  const base = [
    { value: "set" as const, label: "is set" },
    { value: "empty" as const, label: "is empty" },
  ];
  if (field.type === "TEXT") return [{ value: "contains", label: "contains" }, ...base];
  if (field.type === "DROPDOWN") return [{ value: "eq", label: "is" }, ...base];
  return [
    { value: "eq", label: "=" },
    { value: "gte", label: field.type === "DATE" ? "on/after" : "≥" },
    { value: "lte", label: field.type === "DATE" ? "on/before" : "≤" },
    ...base,
  ];
}

/** List-view filter on one custom field. */
export function CustomFieldFilterBar({
  fields,
  filter,
  onChange,
  shown,
  total,
}: {
  fields: CustomFieldDef[];
  filter: CustomFieldFilter | null;
  onChange: (next: CustomFieldFilter | null) => void;
  shown: number;
  total: number;
}) {
  const field = fields.find((f) => f.id === filter?.fieldId) ?? null;
  const needsValue = filter && filter.op !== "set" && filter.op !== "empty";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" data-testid="custom-field-filter">
      <Filter className="h-4 w-4 text-[var(--muted)]" />
      <select
        aria-label="Filter by field"
        className={ctl}
        value={filter?.fieldId ?? ""}
        onChange={(e) => {
          const next = fields.find((f) => f.id === e.target.value);
          onChange(next ? { fieldId: next.id, op: opsFor(next)[0]!.value, value: "" } : null);
        }}
      >
        <option value="">Filter by field…</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      {field && filter && (
        <>
          <select
            aria-label="Filter condition"
            className={ctl}
            value={filter.op}
            onChange={(e) => onChange({ ...filter, op: e.target.value as CustomFieldFilter["op"] })}
          >
            {opsFor(field).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {needsValue &&
            (field.type === "DROPDOWN" ? (
              <select aria-label="Filter value" className={ctl} value={filter.value ?? ""} onChange={(e) => onChange({ ...filter, value: e.target.value })}>
                <option value="">Any</option>
                {(field.options ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                aria-label="Filter value"
                className={ctl}
                type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
                value={filter.value ?? ""}
                onChange={(e) => onChange({ ...filter, value: e.target.value })}
              />
            ))}
          <button type="button" aria-label="Clear field filter" className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => onChange(null)}>
            <X className="h-4 w-4" />
          </button>
          <span className="text-xs text-[var(--muted)]" data-testid="custom-field-filter-count">{shown} of {total} tasks</span>
        </>
      )}
    </div>
  );
}
