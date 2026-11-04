export function normalizeSectionName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** True when `name` matches an existing section (case/whitespace-insensitive), ignoring `exceptId`. */
export function hasDuplicateSectionName(
  sections: { id: string; name: string }[],
  name: string,
  exceptId?: string
): boolean {
  const target = normalizeSectionName(name);
  if (!target) return false;
  return sections.some((s) => s.id !== exceptId && normalizeSectionName(s.name) === target);
}
