import { prisma } from "@/lib/prisma";
import { parseMomContent } from "@/lib/mom-structured";
import {
  emptyMomSuggestionsMap,
  type MomSuggestionCategory,
  type MomSuggestionsMap,
} from "@/lib/mom-suggestions";

const HISTORY_LIMIT = 50;
const TOP_PER_CATEGORY = 20;

type FrequencyMap = Record<MomSuggestionCategory, Map<string, number>>;

function emptyFrequencyMap(): FrequencyMap {
  return {
    agenda: new Map(),
    discussionTopic: new Map(),
    discussionPoint: new Map(),
    decision: new Map(),
    actionTask: new Map(),
    risk: new Map(),
    pendingItem: new Map(),
    nextMeetingAgenda: new Map(),
  };
}

function bump(map: Map<string, number>, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  map.set(trimmed, (map.get(trimmed) ?? 0) + 1);
}

function extractFromContent(content: unknown, freq: FrequencyMap) {
  const parsed = parseMomContent(content as Parameters<typeof parseMomContent>[0]);
  if (!parsed) return;

  for (const item of parsed.agenda) bump(freq.agenda, item);
  for (const item of parsed.decisions) bump(freq.decision, item);
  for (const item of parsed.risks) bump(freq.risk, item);
  for (const item of parsed.pendingItems) bump(freq.pendingItem, item);
  if (parsed.nextMeetingAgenda) bump(freq.nextMeetingAgenda, parsed.nextMeetingAgenda);

  for (const discussion of parsed.discussions) {
    if (discussion.topic) bump(freq.discussionTopic, discussion.topic);
    for (const point of discussion.points) bump(freq.discussionPoint, point);
  }

  for (const action of parsed.actionItems) {
    if (action.task) bump(freq.actionTask, action.task);
  }
}

function frequencyMapToSuggestions(freq: FrequencyMap): MomSuggestionsMap {
  const result = emptyMomSuggestionsMap();

  for (const category of Object.keys(freq) as MomSuggestionCategory[]) {
    const entries = [...freq[category].entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    result[category] = entries.slice(0, TOP_PER_CATEGORY).map(([value]) => value);
  }

  return result;
}

async function loadWorkspaceMomRows(userId: string, workspaceId: string) {
  const conversationIds = (
    await prisma.conversation.findMany({
      where: { workspaceId },
      select: { id: true },
    })
  ).map((c) => c.id);

  return prisma.meetingMinutes.findMany({
    where: {
      OR: [
        { document: { workspaceId } },
        ...(conversationIds.length > 0
          ? [{ conversationId: { in: conversationIds } }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { content: true },
  });
}

async function loadPersonalMomRows(userId: string) {
  const participantConversationIds = (
    await prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: { workspaceId: null },
      },
      select: { conversationId: true },
    })
  ).map((p) => p.conversationId);

  return prisma.meetingMinutes.findMany({
    where: {
      OR: [
        { document: { userId, workspaceId: null } },
        ...(participantConversationIds.length > 0
          ? [{ conversationId: { in: participantConversationIds } }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { content: true },
  });
}

export async function getMomSuggestionHistory(
  userId: string,
  workspaceId: string | null
): Promise<MomSuggestionsMap> {
  const rows = workspaceId
    ? await loadWorkspaceMomRows(userId, workspaceId)
    : await loadPersonalMomRows(userId);

  const freq = emptyFrequencyMap();
  for (const row of rows) {
    if (row.content) extractFromContent(row.content, freq);
  }

  return frequencyMapToSuggestions(freq);
}
