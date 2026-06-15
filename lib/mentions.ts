export function parseMentionNames(body: string): string[] {
  const matches = body.match(/@([A-Za-z][A-Za-z0-9 _.-]{0,48})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).trim()).filter(Boolean))];
}

/** Match @mentions in body against known members (supports multi-word names). */
export function parseMentionsFromBody(
  body: string,
  members: { id: string; name: string }[]
): { id: string; name: string }[] {
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const found: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let i = 0;

  while (i < body.length) {
    if (body[i] === "@") {
      const rest = body.slice(i + 1);
      const match = sorted.find(
        (m) =>
          rest.toLowerCase().startsWith(m.name.toLowerCase()) &&
          (rest.length === m.name.length ||
            rest[m.name.length] === " " ||
            rest[m.name.length] === "\n")
      );
      if (match && !seen.has(match.id)) {
        found.push(match);
        seen.add(match.id);
        i += 1 + match.name.length;
        continue;
      }
    }
    i += 1;
  }

  return found;
}

export function matchMentionedUsers(
  names: string[],
  members: { id: string; name: string }[]
): { id: string; name: string }[] {
  const lower = new Map(members.map((m) => [m.name.toLowerCase(), m]));
  const found: { id: string; name: string }[] = [];
  for (const name of names) {
    const user = lower.get(name.toLowerCase());
    if (user) found.push(user);
  }
  return found;
}

export type MessageBodySegment = { type: "text" | "mention"; value: string };

export function splitMessageBody(
  body: string,
  members: { name: string }[] = []
): MessageBodySegment[] {
  if (!body) return [];
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const parts: MessageBodySegment[] = [];
  let i = 0;

  while (i < body.length) {
    if (body[i] === "@") {
      const rest = body.slice(i + 1);
      const match = sorted.find(
        (m) =>
          rest.toLowerCase().startsWith(m.name.toLowerCase()) &&
          (rest.length === m.name.length ||
            rest[m.name.length] === " " ||
            rest[m.name.length] === "\n")
      );
      if (match) {
        parts.push({ type: "mention", value: match.name });
        i += 1 + match.name.length;
        continue;
      }
      const fallback = rest.match(/^([A-Za-z][A-Za-z0-9 _.-]{0,48})/);
      if (fallback) {
        parts.push({ type: "mention", value: fallback[1] });
        i += 1 + fallback[1].length;
        continue;
      }
    }
    const nextAt = body.indexOf("@", i);
    const end = nextAt === -1 ? body.length : nextAt;
    if (end > i) parts.push({ type: "text", value: body.slice(i, end) });
    i = end === i ? i + 1 : end;
  }

  return parts;
}
export function renderCommentBody(body: string) {
  return body.replace(
    /@([A-Za-z][A-Za-z0-9 _.-]{0,48})/g,
    '<span class="font-semibold text-indigo-500">@$1</span>'
  );
}
