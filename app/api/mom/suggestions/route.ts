import { NextResponse } from "next/server";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getMomSuggestionHistory } from "@/lib/mom-suggestion-history";
import {
  getMomSuggestionPrefs,
  mutateMomSuggestionPref,
  momSuggestionMutateSchema,
} from "@/lib/mom-suggestion-prefs";
import {
  mergeMomSuggestions,
  MOM_SUGGESTION_PRESETS,
  type MomSuggestionsMap,
} from "@/lib/mom-suggestions";
import { getWorkspaceMembership } from "@/lib/workspace";

async function loadSuggestions(userId: string, workspaceId: string | null) {
  const [history, prefs] = await Promise.all([
    getMomSuggestionHistory(userId, workspaceId),
    getMomSuggestionPrefs(userId, workspaceId),
  ]);
  const suggestions: MomSuggestionsMap = mergeMomSuggestions(
    MOM_SUGGESTION_PRESETS,
    history,
    prefs
  );
  return suggestions;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim() || null;

    if (workspaceId) {
      const membership = await getWorkspaceMembership(user.id, workspaceId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const suggestions = await loadSuggestions(user.id, workspaceId);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = momSuggestionMutateSchema.parse(await request.json());
    const workspaceId = body.workspaceId?.trim() || null;

    if (workspaceId) {
      const membership = await getWorkspaceMembership(user.id, workspaceId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    await mutateMomSuggestionPref({
      userId: user.id,
      workspaceId,
      category: body.category,
      action: body.action,
      value: body.value,
    });

    const suggestions = await loadSuggestions(user.id, workspaceId);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return handleApiError(error);
  }
}
