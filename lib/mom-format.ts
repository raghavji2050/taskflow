import type { ConversationType, Prisma } from "@prisma/client";
import { deriveMomPoints, parseMomContent } from "@/lib/mom-structured";

export type SharedMomPreview = {
  id: string;
  documentId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  pointCount: number;
  attendeesLabel: string;
  allAttendees: boolean;
  attendeeUserIds: string[];
  attendeeNames?: string[];
  conversationType?: ConversationType;
  points?: string[];
};

export type MomPoints = string[];

export function parseMomPoints(value: Prisma.JsonValue): MomPoints {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

function parseAttendeeIds(value: Prisma.JsonValue): string[] {
  return parseMomAttendeeIds(value);
}

export function parseMomAttendeeIds(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function buildAttendeesLabel(params: {
  allAttendees: boolean;
  attendeeUserIds: string[];
  attendeeNames?: string[];
  conversationType?: ConversationType;
}) {
  if (params.allAttendees) {
    if (params.conversationType === "WORKSPACE") return "All team members";
    if (params.conversationType === "GROUP") return "All group members";
    if (params.conversationType === "DIRECT") return "All participants";
    return "All members";
  }
  if (params.attendeeNames && params.attendeeNames.length > 0) {
    return params.attendeeNames.join(", ");
  }
  if (params.attendeeUserIds.length === 1) return "1 attendee";
  if (params.attendeeUserIds.length > 1) return `${params.attendeeUserIds.length} attendees`;
  return "—";
}

export function formatMomPreviewFromRecord(
  mom: {
    id: string;
    documentId: string;
    title: string;
    startedAt: Date;
    endedAt: Date | null;
    points: Prisma.JsonValue;
    content?: Prisma.JsonValue | null;
    attendeeUserIds: Prisma.JsonValue;
    allAttendees: boolean;
  },
  options?: {
    conversationType?: ConversationType;
    participants?: { id: string; name: string }[];
  }
): SharedMomPreview {
  const parsedContent = parseMomContent(mom.content);
  const pointsFromDb = parseMomPoints(mom.points);
  const points = parsedContent ? deriveMomPoints(parsedContent) : pointsFromDb;
  const attendeeUserIds = parseMomAttendeeIds(mom.attendeeUserIds);
  const conversationType = options?.conversationType;
  const attendeeNames =
    options?.participants && attendeeUserIds.length > 0
      ? options.participants
          .filter((p) => attendeeUserIds.includes(p.id))
          .map((p) => p.name)
      : undefined;
  const attendeesLabel = buildAttendeesLabel({
    allAttendees: mom.allAttendees,
    attendeeUserIds,
    attendeeNames,
    conversationType,
  });

  return {
    id: mom.id,
    documentId: mom.documentId,
    title: mom.title,
    startedAt: mom.startedAt.toISOString(),
    endedAt: mom.endedAt?.toISOString() ?? null,
    pointCount: points.length,
    attendeesLabel,
    allAttendees: mom.allAttendees,
    attendeeUserIds,
    attendeeNames,
    conversationType,
    points,
  };
}

export function defaultMomTitle(startedAt: Date) {
  return `Meeting — ${startedAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}
