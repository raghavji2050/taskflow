import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const TIME_TRACKING_PREFS_SCOPE = "time-tracking";

const timeTrackingPrefsSchema = z.object({
  runningReminderHours: z.number().int().min(0).max(24).default(4),
  runningReminderEndOfDay: z.boolean().default(true),
  endOfDayHour: z.number().int().min(0).max(23).default(18),
  idleTimeoutMinutes: z.number().int().min(0).max(120).default(10),
  timezone: z.string().min(1).default("UTC"),
});

export type TimeTrackingPrefs = z.infer<typeof timeTrackingPrefsSchema>;

export function defaultTimeTrackingPrefs(): TimeTrackingPrefs {
  let timezone = "UTC";
  if (typeof Intl !== "undefined") {
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* keep UTC */
    }
  }
  return timeTrackingPrefsSchema.parse({ timezone });
}

export function normalizeTimeTrackingPrefs(data: unknown): TimeTrackingPrefs {
  const parsed = timeTrackingPrefsSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  return defaultTimeTrackingPrefs();
}

export async function getTimeTrackingPrefs(userId: string): Promise<TimeTrackingPrefs> {
  const row = await prisma.momSuggestionPreference.findUnique({
    where: {
      userId_scopeKey: { userId, scopeKey: TIME_TRACKING_PREFS_SCOPE },
    },
    select: { data: true },
  });
  if (!row?.data) return defaultTimeTrackingPrefs();
  return normalizeTimeTrackingPrefs(row.data);
}

export async function updateTimeTrackingPrefs(
  userId: string,
  input: Partial<TimeTrackingPrefs>
): Promise<TimeTrackingPrefs> {
  const current = await getTimeTrackingPrefs(userId);
  const next = normalizeTimeTrackingPrefs({ ...current, ...input });

  await prisma.momSuggestionPreference.upsert({
    where: { userId_scopeKey: { userId, scopeKey: TIME_TRACKING_PREFS_SCOPE } },
    create: { userId, scopeKey: TIME_TRACKING_PREFS_SCOPE, data: next },
    update: { data: next },
  });

  return next;
}

export const timeTrackingPrefsUpdateSchema = timeTrackingPrefsSchema.partial();

const DEFAULT_LABELS = ["meeting", "dev", "review"] as const;

export async function ensureDefaultTimeEntryLabels(userId: string) {
  for (const name of DEFAULT_LABELS) {
    await prisma.timeEntryLabel.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {},
    });
  }
}

export async function listTimeEntryLabels(userId: string) {
  await ensureDefaultTimeEntryLabels(userId);
  return prisma.timeEntryLabel.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}

export async function createTimeEntryLabel(userId: string, name: string, color?: string | null) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Label name is required");
  return prisma.timeEntryLabel.create({
    data: { userId, name: trimmed, color: color ?? null },
  });
}
