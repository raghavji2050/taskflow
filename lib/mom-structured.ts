import type { Prisma } from "@prisma/client";
import { formatMomDateTime, formatMomDueDate } from "@/lib/document-ui";

export type MomActionItemPriority = "low" | "medium" | "high";
export type MomActionItemStatus = "pending" | "in_progress" | "done";

export type MomActionItem = {
  id: string;
  task: string;
  owner: string;
  dueDate: string;
  priority: MomActionItemPriority;
  status: MomActionItemStatus;
  taskId?: string | null;
  createTask?: boolean;
};

export type MomDiscussionTopic = {
  id: string;
  topic: string;
  points: string[];
};

export type MomStructuredContent = {
  location: string;
  organizer: string;
  agenda: string[];
  discussions: MomDiscussionTopic[];
  decisions: string[];
  actionItems: MomActionItem[];
  risks: string[];
  pendingItems: string[];
  nextMeetingDate: string;
  nextMeetingAgenda: string;
};

export function createEmptyMomContent(organizer = "", defaultActionOwner = ""): MomStructuredContent {
  return {
    location: "",
    organizer,
    agenda: [""],
    discussions: [{ id: crypto.randomUUID(), topic: "", points: [""] }],
    decisions: [""],
    actionItems: [
      {
        id: crypto.randomUUID(),
        task: "",
        owner: defaultActionOwner,
        dueDate: "",
        priority: "medium",
        status: "pending",
        createTask: true,
      },
    ],
    risks: [""],
    pendingItems: [""],
    nextMeetingDate: "",
    nextMeetingAgenda: "",
  };
}

function cleanStrings(values: string[]) {
  return values.map((v) => v.trim()).filter(Boolean);
}

function cleanDiscussions(discussions: MomDiscussionTopic[]) {
  return discussions
    .map((d) => ({
      ...d,
      topic: d.topic.trim(),
      points: cleanStrings(d.points),
    }))
    .filter((d) => d.topic || d.points.length > 0);
}

function cleanActionItems(items: MomActionItem[]) {
  return items.filter((item) => item.task.trim());
}

export function normalizeMomContent(raw: MomStructuredContent): MomStructuredContent {
  return {
    location: raw.location.trim(),
    organizer: raw.organizer.trim(),
    agenda: cleanStrings(raw.agenda),
    discussions: cleanDiscussions(raw.discussions),
    decisions: cleanStrings(raw.decisions),
    actionItems: cleanActionItems(
      raw.actionItems.map((item) => ({
        ...item,
        task: item.task.trim(),
        owner: item.owner.trim(),
        dueDate: item.dueDate.trim(),
        taskId: item.taskId ?? null,
        createTask: item.taskId ? false : item.createTask !== false,
      }))
    ),
    risks: cleanStrings(raw.risks),
    pendingItems: cleanStrings(raw.pendingItems),
    nextMeetingDate: raw.nextMeetingDate.trim(),
    nextMeetingAgenda: raw.nextMeetingAgenda.trim(),
  };
}

export function deriveMomPoints(content: MomStructuredContent): string[] {
  const normalized = normalizeMomContent(content);
  const fromAgenda = normalized.agenda.map((a) => `Agenda: ${a}`);
  const fromDiscussions = normalized.discussions.flatMap((d) =>
    d.points.map((p) => (d.topic ? `${d.topic}: ${p}` : p))
  );
  const fromDecisions = normalized.decisions.map((d) => `Decision: ${d}`);
  const fromActions = normalized.actionItems.map(
    (a) => `Action: ${a.task}${a.owner ? ` (${a.owner})` : ""}`
  );
  return [...fromAgenda, ...fromDiscussions, ...fromDecisions, ...fromActions].slice(0, 100);
}

export function momContentHasData(content: MomStructuredContent) {
  const n = normalizeMomContent(content);
  return (
    n.agenda.length > 0 ||
    n.discussions.some((d) => d.points.length > 0) ||
    n.decisions.length > 0 ||
    n.actionItems.length > 0 ||
    n.risks.length > 0 ||
    n.pendingItems.length > 0 ||
    Boolean(n.nextMeetingDate || n.nextMeetingAgenda)
  );
}

export function parseMomContent(value: Prisma.JsonValue | null | undefined): MomStructuredContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const discussions = Array.isArray(o.discussions)
    ? (o.discussions as unknown[]).map((d, i) => {
        const row = d as Record<string, unknown>;
        return {
          id: typeof row.id === "string" ? row.id : `topic-${i}`,
          topic: typeof row.topic === "string" ? row.topic : "",
          points: Array.isArray(row.points)
            ? row.points.filter((p): p is string => typeof p === "string")
            : [],
        };
      })
    : [];
  const actionItems = Array.isArray(o.actionItems)
    ? (o.actionItems as unknown[]).map((a, i) => {
        const row = a as Record<string, unknown>;
        return {
          id: typeof row.id === "string" ? row.id : `action-${i}`,
          task: typeof row.task === "string" ? row.task : "",
          owner: typeof row.owner === "string" ? row.owner : "",
          dueDate: typeof row.dueDate === "string" ? row.dueDate : "",
          priority:
            row.priority === "low" || row.priority === "high" ? row.priority : "medium",
          status:
            row.status === "in_progress" || row.status === "done" ? row.status : "pending",
          taskId: typeof row.taskId === "string" ? row.taskId : null,
          createTask: row.createTask === false ? false : true,
        } satisfies MomActionItem;
      })
    : [];

  return {
    location: typeof o.location === "string" ? o.location : "",
    organizer: typeof o.organizer === "string" ? o.organizer : "",
    agenda: Array.isArray(o.agenda) ? o.agenda.filter((a): a is string => typeof a === "string") : [],
    discussions,
    decisions: Array.isArray(o.decisions)
      ? o.decisions.filter((d): d is string => typeof d === "string")
      : [],
    actionItems,
    risks: Array.isArray(o.risks) ? o.risks.filter((r): r is string => typeof r === "string") : [],
    pendingItems: Array.isArray(o.pendingItems)
      ? o.pendingItems.filter((p): p is string => typeof p === "string")
      : [],
    nextMeetingDate: typeof o.nextMeetingDate === "string" ? o.nextMeetingDate : "",
    nextMeetingAgenda: typeof o.nextMeetingAgenda === "string" ? o.nextMeetingAgenda : "",
  };
}

function formatDateOnly(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTimeRange(startedAt: Date, endedAt: Date | null) {
  const start = formatMomDateTime(startedAt.toISOString());
  const end = endedAt ? formatMomDateTime(endedAt.toISOString()) : "—";
  return `${start} - ${end}`;
}

function bulletSection(title: string, items: string[]) {
  if (items.length === 0) return [`## ${title}`, "", "_None recorded._", ""];
  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""];
}

export function buildStructuredMomDocumentBody(params: {
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  attendeesLabel: string;
  content: MomStructuredContent;
}) {
  const c = normalizeMomContent(params.content);
  const lines: string[] = [
    "# Minutes of Meeting (MoM)",
    "",
    `**Meeting Title:** ${params.title}`,
    `**Date:** ${formatDateOnly(params.startedAt.toISOString())}`,
    `**Time:** ${formatTimeRange(params.startedAt, params.endedAt)}`,
    `**Location:** ${c.location || "—"}`,
    `**Organizer:** ${c.organizer || "—"}`,
    `**Attendees:** ${params.attendeesLabel}`,
    "",
    "## Agenda",
  ];

  if (c.agenda.length === 0) {
    lines.push("", "_None recorded._", "");
  } else {
    lines.push("");
    c.agenda.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
    lines.push("");
  }

  lines.push("## Discussion Summary");
  if (c.discussions.length === 0) {
    lines.push("", "_None recorded._", "");
  } else {
    lines.push("");
    for (const topic of c.discussions) {
      if (topic.topic) lines.push(`### ${topic.topic}`);
      if (topic.points.length === 0) {
        lines.push("- _No points recorded._");
      } else {
        topic.points.forEach((p) => lines.push(`- ${p}`));
      }
      lines.push("");
    }
  }

  lines.push(...bulletSection("Decisions Taken", c.decisions));

  lines.push("## Action Items");
  if (c.actionItems.length === 0) {
    lines.push("", "_None recorded._", "");
  } else {
    lines.push(
      "",
      "| Task | Owner | Due Date | Priority | Status |",
      "|------|--------|-----------|-----------|---------|"
    );
    for (const item of c.actionItems) {
      lines.push(
        `| ${item.task} | ${item.owner || "—"} | ${item.dueDate ? formatMomDueDate(item.dueDate) : "—"} | ${item.priority} | ${item.status} |`
      );
    }
    lines.push("");
  }

  lines.push(...bulletSection("Risks / Blockers", c.risks));
  lines.push(...bulletSection("Pending Items", c.pendingItems));

  lines.push("## Next Meeting");
  lines.push(
    "",
    `Date: ${c.nextMeetingDate ? formatDateOnly(c.nextMeetingDate) : "—"}`,
    `Agenda: ${c.nextMeetingAgenda || "—"}`,
    ""
  );

  return lines.join("\n");
}

export function formatElapsedSeconds(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function coerceMomStructuredContent(input: {
  location?: string;
  organizer?: string;
  agenda?: string[];
  discussions?: { id?: string; topic?: string; points?: string[] }[];
  decisions?: string[];
  actionItems?: {
    id?: string;
    task: string;
    owner?: string;
    dueDate?: string;
    priority?: MomActionItemPriority;
    status?: MomActionItemStatus;
    taskId?: string | null;
    createTask?: boolean;
  }[];
  risks?: string[];
  pendingItems?: string[];
  nextMeetingDate?: string;
  nextMeetingAgenda?: string;
}): MomStructuredContent {
  return normalizeMomContent({
    location: input.location ?? "",
    organizer: input.organizer ?? "",
    agenda: input.agenda ?? [],
    discussions: (input.discussions ?? []).map((d, i) => ({
      id: d.id ?? `topic-${i}`,
      topic: d.topic ?? "",
      points: d.points ?? [],
    })),
    decisions: input.decisions ?? [],
    actionItems: (input.actionItems ?? []).map((a, i) => ({
      id: a.id ?? `action-${i}`,
      task: a.task,
      owner: a.owner ?? "",
      dueDate: a.dueDate ?? "",
      priority: a.priority ?? "medium",
      status: a.status ?? "pending",
      taskId: a.taskId ?? null,
      createTask: a.createTask !== false,
    })),
    risks: input.risks ?? [],
    pendingItems: input.pendingItems ?? [],
    nextMeetingDate: input.nextMeetingDate ?? "",
    nextMeetingAgenda: input.nextMeetingAgenda ?? "",
  });
}
