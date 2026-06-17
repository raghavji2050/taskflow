export type MomSuggestionCategory =
  | "agenda"
  | "discussionTopic"
  | "discussionPoint"
  | "decision"
  | "actionTask"
  | "risk"
  | "pendingItem"
  | "nextMeetingAgenda";

export type MomSuggestionsMap = Record<MomSuggestionCategory, string[]>;

export const MOM_SUGGESTION_CATEGORIES: MomSuggestionCategory[] = [
  "agenda",
  "discussionTopic",
  "discussionPoint",
  "decision",
  "actionTask",
  "risk",
  "pendingItem",
  "nextMeetingAgenda",
];

export const MOM_SUGGESTION_PRESETS: MomSuggestionsMap = {
  agenda: [
    "Daily follow-up",
    "Sprint review",
    "Status update",
    "Budget review",
    "Hiring updates",
    "Roadmap review",
    "Project kickoff",
    "Retrospective",
    "Client feedback",
    "Team sync",
  ],
  discussionTopic: [
    "Product updates",
    "Engineering blockers",
    "Sales pipeline",
    "Team capacity",
    "Customer issues",
    "Release planning",
    "Marketing initiatives",
  ],
  discussionPoint: [
    "Key takeaway",
    "Open question",
    "Decision needed",
    "Risk identified",
    "Action agreed",
    "Follow-up required",
  ],
  decision: [
    "Approved proposal",
    "Deferred to next meeting",
    "Owner assigned",
    "Budget approved",
    "Timeline confirmed",
    "Scope change accepted",
  ],
  actionTask: [
    "Send follow-up email",
    "Update documentation",
    "Schedule next meeting",
    "Share meeting notes",
    "Review deliverables",
    "Prepare status report",
  ],
  risk: [
    "Timeline risk",
    "Resource constraint",
    "External dependency",
    "Budget overrun",
    "Scope creep",
    "Staffing gap",
  ],
  pendingItem: [
    "Awaiting client approval",
    "Pending legal review",
    "Waiting on vendor response",
    "Needs stakeholder sign-off",
    "Blocked on dependency",
  ],
  nextMeetingAgenda: [
    "Sprint planning",
    "Quarterly review",
    "Project status review",
    "Budget planning",
    "Team retrospective",
  ],
};

export function emptyMomSuggestionsMap(): MomSuggestionsMap {
  return {
    agenda: [],
    discussionTopic: [],
    discussionPoint: [],
    decision: [],
    actionTask: [],
    risk: [],
    pendingItem: [],
    nextMeetingAgenda: [],
  };
}

export type MomSuggestionPrefsData = {
  added: MomSuggestionsMap;
  hidden: MomSuggestionsMap;
};

export function emptyMomSuggestionPrefs(): MomSuggestionPrefsData {
  return {
    added: emptyMomSuggestionsMap(),
    hidden: emptyMomSuggestionsMap(),
  };
}

export function normalizeMomSuggestionPrefs(raw: unknown): MomSuggestionPrefsData {
  const result = emptyMomSuggestionPrefs();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;

  const o = raw as Record<string, unknown>;
  for (const side of ["added", "hidden"] as const) {
    const block = o[side];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    for (const category of MOM_SUGGESTION_CATEGORIES) {
      const values = (block as Record<string, unknown>)[category];
      if (!Array.isArray(values)) continue;
      result[side][category] = values
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }
  return result;
}

function normalizeSuggestion(value: string) {
  return value.trim();
}

function suggestionKey(value: string) {
  return normalizeSuggestion(value).toLowerCase();
}

export function mergeMomSuggestions(
  presets: MomSuggestionsMap,
  history: MomSuggestionsMap,
  prefs: MomSuggestionPrefsData = emptyMomSuggestionPrefs(),
  limitPerCategory = 30
): MomSuggestionsMap {
  const result = emptyMomSuggestionsMap();

  for (const category of MOM_SUGGESTION_CATEGORIES) {
    const seen = new Set<string>();
    const hidden = new Set((prefs.hidden[category] ?? []).map(suggestionKey));
    const merged: string[] = [];

    const add = (raw: string) => {
      const value = normalizeSuggestion(raw);
      if (!value) return;
      const key = suggestionKey(value);
      if (seen.has(key) || hidden.has(key)) return;
      seen.add(key);
      merged.push(value);
    };

    for (const item of prefs.added[category] ?? []) add(item);
    for (const item of presets[category] ?? []) add(item);
    for (const item of history[category] ?? []) add(item);

    result[category] = merged.slice(0, limitPerCategory);
  }

  return result;
}

export function filterMomSuggestions(
  suggestions: string[],
  query: string,
  exclude: string[] = []
): string[] {
  const excludeKeys = new Set(exclude.map(suggestionKey));
  const q = query.trim().toLowerCase();

  return suggestions.filter((s) => {
    const key = suggestionKey(s);
    if (excludeKeys.has(key)) return false;
    if (!q) return true;
    return key.includes(q);
  });
}
