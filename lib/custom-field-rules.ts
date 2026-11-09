/** Pure rules for project custom fields (no DB imports, safe for client + tests). */

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN"] as const;
export type CustomFieldTypeName = (typeof CUSTOM_FIELD_TYPES)[number];

export const MAX_CUSTOM_FIELDS_PER_PROJECT = 20;
export const MAX_DROPDOWN_OPTIONS = 30;
export const MAX_TEXT_VALUE_LENGTH = 500;

export type CustomFieldDef = {
  id: string;
  name: string;
  type: CustomFieldTypeName;
  options: string[] | null;
  position?: number;
};

export type CustomFieldValueRow = { fieldId: string; value: string };

export class CustomFieldError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "CustomFieldError";
  }
}

/** Trim, drop blanks and case-insensitive duplicates, cap length. */
export function cleanOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options) {
    if (typeof raw !== "string") continue;
    const v = raw.trim().slice(0, 60);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, MAX_DROPDOWN_OPTIONS);
}

/** Read the stored JSON options safely. */
export function parseOptions(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return cleanOptions(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return cleanOptions(raw);
}

export function validateFieldDefinition(input: { name: string; type: string; options?: unknown }) {
  const name = input.name.trim();
  if (!name) throw new CustomFieldError("Field name is required");
  if (name.length > 80) throw new CustomFieldError("Field name is too long (max 80)");
  if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(input.type)) {
    throw new CustomFieldError("Type must be TEXT, NUMBER, DATE or DROPDOWN");
  }
  const type = input.type as CustomFieldTypeName;
  if (type !== "DROPDOWN") return { name, type, options: null as string[] | null };
  const options = cleanOptions(input.options);
  if (options.length === 0) throw new CustomFieldError("A dropdown needs at least one option");
  return { name, type, options };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(v: string) {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Turn user input into the stored string for this field, or null to clear it.
 * Throws CustomFieldError on bad input.
 */
export function normalizeFieldValue(field: Pick<CustomFieldDef, "type" | "options" | "name">, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") raw = String(raw);
  if (typeof raw !== "string") throw new CustomFieldError(`Invalid value for ${field.name}`);
  const v = raw.trim();
  if (!v) return null;
  switch (field.type) {
    case "TEXT":
      if (v.length > MAX_TEXT_VALUE_LENGTH) throw new CustomFieldError(`${field.name} is too long (max ${MAX_TEXT_VALUE_LENGTH})`);
      return v;
    case "NUMBER": {
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(n)) throw new CustomFieldError(`${field.name} must be a number`);
      return String(n);
    }
    case "DATE": {
      const day = v.slice(0, 10);
      if (!isRealDate(day)) throw new CustomFieldError(`${field.name} must be a date (YYYY-MM-DD)`);
      return day;
    }
    case "DROPDOWN": {
      const options = field.options ?? [];
      const match = options.find((o) => o.toLowerCase() === v.toLowerCase());
      if (!match) throw new CustomFieldError(`${field.name} must be one of: ${options.join(", ")}`);
      return match;
    }
  }
}

/** Short label for a chip / column cell. */
export function formatFieldValue(type: CustomFieldTypeName, value: string | null | undefined) {
  if (value == null || value === "") return "";
  if (type === "NUMBER") {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-IN") : value;
  }
  if (type === "DATE" && DATE_RE.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  return value;
}

export type CustomFieldFilter = {
  fieldId: string;
  /** "set" | "empty" | "eq" (dropdown/date/number exact) | "contains" (text) | "gte" | "lte" (number/date) */
  op: "set" | "empty" | "eq" | "contains" | "gte" | "lte";
  value?: string;
};

export function valueFor(values: CustomFieldValueRow[] | undefined, fieldId: string) {
  return values?.find((v) => v.fieldId === fieldId)?.value ?? null;
}

/** Does a task's value pass a list-view filter? Unknown field => keep task. */
export function matchesCustomFieldFilter(
  fields: CustomFieldDef[],
  values: CustomFieldValueRow[] | undefined,
  filter: CustomFieldFilter | null
) {
  if (!filter) return true;
  const field = fields.find((f) => f.id === filter.fieldId);
  if (!field) return true;
  const v = valueFor(values, field.id);
  if (filter.op === "set") return v != null;
  if (filter.op === "empty") return v == null;
  const target = (filter.value ?? "").trim();
  if (!target) return true;
  if (v == null) return false;
  if (filter.op === "contains") return v.toLowerCase().includes(target.toLowerCase());
  if (field.type === "NUMBER") {
    const a = Number(v);
    const b = Number(target);
    if (!Number.isFinite(b)) return true;
    if (filter.op === "gte") return a >= b;
    if (filter.op === "lte") return a <= b;
    return a === b;
  }
  // text/dropdown/date compare as strings (dates are YYYY-MM-DD so lexical order works)
  if (filter.op === "gte") return v >= target;
  if (filter.op === "lte") return v <= target;
  return v.toLowerCase() === target.toLowerCase();
}
