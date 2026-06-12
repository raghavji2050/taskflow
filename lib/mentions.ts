export function parseMentionNames(body: string): string[] {
  const matches = body.match(/@([A-Za-z][A-Za-z0-9 _.-]{0,48})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).trim()).filter(Boolean))];
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

export function renderCommentBody(body: string) {
  return body.replace(
    /@([A-Za-z][A-Za-z0-9 _.-]{0,48})/g,
    '<span class="font-semibold text-indigo-500">@$1</span>'
  );
}
