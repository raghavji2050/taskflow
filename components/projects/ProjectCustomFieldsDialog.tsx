"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { CUSTOM_FIELD_TYPES, type CustomFieldDef, type CustomFieldTypeName } from "@/lib/custom-field-rules";

const TYPE_LABELS: Record<CustomFieldTypeName, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  DROPDOWN: "Dropdown",
};

export function ProjectCustomFieldsDialog({
  isOpen,
  onClose,
  projectId,
  fields,
  canManage,
  onChanged,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  fields: CustomFieldDef[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldTypeName>("TEXT");
  const [options, setOptions] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/custom-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          ...(type === "DROPDOWN" ? { options: options.split(",").map((o) => o.trim()).filter(Boolean) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not add field");
        return;
      }
      setName("");
      setOptions("");
      setType("TEXT");
      toast.success("Field added");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (field: CustomFieldDef) => {
    if (!confirm(`Delete field “${field.name}”? Values on every task will be removed.`)) return;
    const res = await fetch(`/api/projects/${projectId}/custom-fields/${field.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not delete field");
      return;
    }
    onChanged();
  };

  const canSubmit = name.trim() && (type !== "DROPDOWN" || options.split(",").some((o) => o.trim()));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Custom fields"
      description="Fields every task in this project can fill in. Shown as chips in List view."
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4" data-testid="custom-fields-dialog">
        {fields.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No custom fields yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {fields.map((field) => (
              <li key={field.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-hover)] px-3 py-2 text-sm" data-testid="custom-field-row">
                <span className="min-w-0 flex-1 truncate font-medium">{field.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  {TYPE_LABELS[field.type]}
                  {field.type === "DROPDOWN" && field.options?.length ? ` · ${field.options.join(", ")}` : ""}
                </span>
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Delete field ${field.name}`}
                    className="rounded p-1 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500"
                    onClick={() => { void remove(field); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form
            className="space-y-2 border-t border-[var(--border)] pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit && !saving) void create();
            }}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
              <Input label="Field name" placeholder="e.g. Budget" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              <Select
                label="Type"
                name="custom-field-type"
                value={type}
                onChange={(e) => setType(e.target.value as CustomFieldTypeName)}
                options={CUSTOM_FIELD_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
              />
            </div>
            {type === "DROPDOWN" && (
              <Input label="Options (comma separated)" placeholder="Low, Medium, High" value={options} onChange={(e) => setOptions(e.target.value)} />
            )}
            <Button type="submit" size="sm" disabled={!canSubmit || saving}>Add field</Button>
          </form>
        ) : (
          <p className="text-xs text-[var(--muted)]">Only project admins can add or remove fields.</p>
        )}
      </div>
    </Modal>
  );
}
