import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { validateAuthorize } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") q.set(k, v);

  const result = await validateAuthorize(q);
  if (!result.ok) {
    if (result.redirect) redirect(result.redirect);
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold">Can&apos;t connect</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{result.error}</p>
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${q.toString()}`)}`);
  }

  const p = result.params;
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center p-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Connect {p.clientName} to Taskflow?</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          <strong>{p.clientName}</strong> will be able to read and manage your tasks, projects and comments as{" "}
          <strong>{session.user.email ?? session.user.name}</strong>, with the same permissions you have.
        </p>
        <p className="mt-2 break-all text-xs text-[var(--text-muted)]">Redirects to: {new URL(p.redirectUri).origin}</p>
        <form method="post" action="/oauth/approve" className="mt-6 flex gap-3">
          {(["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "resource", "response_type"] as const).map((k) => {
            const v = k === "redirect_uri" ? p.redirectUri : q.get(k);
            return v ? <input key={k} type="hidden" name={k} value={v} /> : null;
          })}
          <button name="decision" value="allow" className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white">
            Allow
          </button>
          <button name="decision" value="deny" className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2">
            Deny
          </button>
        </form>
      </div>
    </main>
  );
}
