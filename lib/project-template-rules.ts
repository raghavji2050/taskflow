/** Project templates: built-ins + validation (pure). */
export type TemplateTask = { title: string; priority?: "LOW" | "MEDIUM" | "HIGH"; description?: string; dueInDays?: number | null };
export type TemplateSection = { name: string; tasks: TemplateTask[] };
export type TemplateData = { sections: TemplateSection[] };
export type TemplateSummary = { id: string; name: string; description: string | null; color: string | null; builtIn: boolean; sectionCount: number; taskCount: number };

export const MAX_TEMPLATE_SECTIONS = 20;
export const MAX_TEMPLATE_TASKS = 200;

const t = (title: string, priority: TemplateTask["priority"] = "MEDIUM", dueInDays: number | null = null): TemplateTask => ({ title, priority, dueInDays });

export const BUILTIN_TEMPLATES: Array<{ id: string; name: string; description: string; color: string; data: TemplateData }> = [
  {
    id: "builtin:sprint", name: "Software sprint", color: "#4f5abf", description: "Two-week sprint: backlog, in progress, review, done.",
    data: { sections: [
      { name: "Backlog", tasks: [t("Groom backlog and estimate stories", "HIGH", 1), t("Define sprint goal", "HIGH", 1)] },
      { name: "In progress", tasks: [t("Build feature behind a flag", "MEDIUM", 7)] },
      { name: "Review / QA", tasks: [t("Code review + QA on staging", "MEDIUM", 11)] },
      { name: "Done", tasks: [t("Sprint demo and retro", "LOW", 14)] },
    ] },
  },
  {
    id: "builtin:marketing", name: "Marketing campaign", color: "#d97706", description: "Plan, create, launch and measure a campaign.",
    data: { sections: [
      { name: "Plan", tasks: [t("Set goal, audience and budget", "HIGH", 2), t("Pick channels (Instagram, email, ads)", "MEDIUM", 3)] },
      { name: "Create", tasks: [t("Write copy", "MEDIUM", 6), t("Design creatives", "MEDIUM", 8)] },
      { name: "Launch", tasks: [t("Schedule posts and emails", "HIGH", 10)] },
      { name: "Measure", tasks: [t("Report results vs goal", "LOW", 21)] },
    ] },
  },
  {
    id: "builtin:client", name: "Client onboarding", color: "#059669", description: "Kick-off to first delivery for a new client.",
    data: { sections: [
      { name: "Kick-off", tasks: [t("Send welcome email + contract", "HIGH", 0), t("Kick-off call", "HIGH", 2)] },
      { name: "Setup", tasks: [t("Collect access and brand assets", "MEDIUM", 4), t("Create shared folder", "LOW", 4)] },
      { name: "Delivery", tasks: [t("First deliverable", "HIGH", 14), t("Feedback round", "MEDIUM", 17)] },
    ] },
  },
  {
    id: "builtin:event", name: "Event planning", color: "#db2777", description: "Venue, vendors, invites and day-of checklist.",
    data: { sections: [
      { name: "Venue & budget", tasks: [t("Fix date, budget and guest count", "HIGH", 1), t("Book venue", "HIGH", 7)] },
      { name: "Vendors", tasks: [t("Catering", "MEDIUM", 14), t("Decor and sound", "MEDIUM", 14)] },
      { name: "Guests", tasks: [t("Send invites", "HIGH", 10), t("Track RSVPs", "MEDIUM", 20)] },
      { name: "Day of", tasks: [t("Run-of-show checklist", "HIGH", 28)] },
    ] },
  },
];

export function isBuiltinId(id: string) {
  return id.startsWith("builtin:");
}

const PRI = new Set(["LOW", "MEDIUM", "HIGH"]);

/** Validate + normalise untrusted template JSON. Returns null when unusable. */
export function parseTemplateData(raw: unknown): TemplateData | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as TemplateData).sections)) return null;
  let taskTotal = 0;
  const sections: TemplateSection[] = [];
  for (const s of (raw as TemplateData).sections.slice(0, MAX_TEMPLATE_SECTIONS)) {
    if (!s || typeof s.name !== "string" || !s.name.trim()) continue;
    const tasks: TemplateTask[] = [];
    for (const k of Array.isArray(s.tasks) ? s.tasks : []) {
      if (taskTotal >= MAX_TEMPLATE_TASKS) break;
      if (!k || typeof k.title !== "string" || !k.title.trim()) continue;
      const d = typeof k.dueInDays === "number" && Number.isFinite(k.dueInDays) ? Math.max(0, Math.min(365, Math.round(k.dueInDays))) : null;
      tasks.push({ title: k.title.trim().slice(0, 200), priority: PRI.has(k.priority as string) ? k.priority : "MEDIUM", description: typeof k.description === "string" ? k.description.slice(0, 2000) : undefined, dueInDays: d });
      taskTotal++;
    }
    sections.push({ name: s.name.trim().slice(0, 80), tasks });
  }
  return sections.length ? { sections } : null;
}

export function summarize(id: string, name: string, description: string | null, color: string | null, data: TemplateData, builtIn: boolean): TemplateSummary {
  return { id, name, description, color, builtIn, sectionCount: data.sections.length, taskCount: data.sections.reduce((a, s) => a + s.tasks.length, 0) };
}

/** Turn an existing project into template data (due dates become offsets from `now`). */
export function snapshotProject(sections: Array<{ id: string; name: string }>, tasks: Array<{ title: string; priority: string; description: string | null; dueDate: Date | null; sectionId: string | null }>, now = new Date()): TemplateData {
  const day = 86_400_000;
  const byId = new Map(sections.map((s) => [s.id, { name: s.name, tasks: [] as TemplateTask[] }]));
  const loose: TemplateTask[] = [];
  for (const k of tasks) {
    const tt: TemplateTask = { title: k.title, priority: PRI.has(k.priority) ? (k.priority as TemplateTask["priority"]) : "MEDIUM", description: k.description ?? undefined, dueInDays: k.dueDate ? Math.max(0, Math.round((k.dueDate.getTime() - now.getTime()) / day)) : null };
    (k.sectionId && byId.get(k.sectionId)?.tasks ? byId.get(k.sectionId)!.tasks : loose).push(tt);
  }
  const out = [...byId.values()];
  if (loose.length) (out[0] ?? (out[0] = { name: "To do", tasks: [] })).tasks.push(...loose);
  return parseTemplateData({ sections: out }) ?? { sections: [{ name: "To do", tasks: [] }] };
}
