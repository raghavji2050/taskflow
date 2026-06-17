import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  MOM_SUGGESTION_CATEGORIES,
  type MomSuggestionCategory,
  type MomSuggestionPrefsData,
  emptyMomSuggestionPrefs,
  normalizeMomSuggestionPrefs,
} from "@/lib/mom-suggestions";

export function momSuggestionScopeKey(workspaceId: string | null) {
  return workspaceId?.trim() || "personal";
}

export async function getMomSuggestionPrefs(
  userId: string,
  workspaceId: string | null
): Promise<MomSuggestionPrefsData> {
  const row = await prisma.momSuggestionPreference.findUnique({
    where: {
      userId_scopeKey: {
        userId,
        scopeKey: momSuggestionScopeKey(workspaceId),
      },
    },
    select: { data: true },
  });

  if (!row?.data) return emptyMomSuggestionPrefs();
  return normalizeMomSuggestionPrefs(row.data);
}

export async function mutateMomSuggestionPref(params: {
  userId: string;
  workspaceId: string | null;
  category: MomSuggestionCategory;
  action: "add" | "hide";
  value: string;
}): Promise<MomSuggestionPrefsData> {
  const trimmed = params.value.trim();
  if (!trimmed) throw new Error("Suggestion cannot be empty");
  if (!MOM_SUGGESTION_CATEGORIES.includes(params.category)) {
    throw new Error("Invalid suggestion category");
  }

  const scopeKey = momSuggestionScopeKey(params.workspaceId);
  const existing = await getMomSuggestionPrefs(params.userId, params.workspaceId);
  const next = emptyMomSuggestionPrefs();

  for (const category of MOM_SUGGESTION_CATEGORIES) {
    next.added[category] = [...(existing.added[category] ?? [])];
    next.hidden[category] = [...(existing.hidden[category] ?? [])];
  }

  const added = next.added[params.category]!;
  const hidden = next.hidden[params.category]!;
  const lower = trimmed.toLowerCase();

  if (params.action === "add") {
    hidden.splice(
      hidden.findIndex((h) => h.toLowerCase() === lower),
      1
    );
    if (!added.some((a) => a.toLowerCase() === lower)) {
      added.unshift(trimmed);
    }
  } else {
    if (!hidden.some((h) => h.toLowerCase() === lower)) {
      hidden.push(trimmed);
    }
    const addedIdx = added.findIndex((a) => a.toLowerCase() === lower);
    if (addedIdx >= 0) added.splice(addedIdx, 1);
  }

  await prisma.momSuggestionPreference.upsert({
    where: { userId_scopeKey: { userId: params.userId, scopeKey } },
    create: {
      userId: params.userId,
      scopeKey,
      data: next,
    },
    update: { data: next },
  });

  return next;
}

export const momSuggestionMutateSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  category: z.enum([
    "agenda",
    "discussionTopic",
    "discussionPoint",
    "decision",
    "actionTask",
    "risk",
    "pendingItem",
    "nextMeetingAgenda",
  ]),
  action: z.enum(["add", "hide"]),
  value: z.string().min(1).max(200),
});
