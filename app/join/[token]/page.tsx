import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { previewInvite } from "@/lib/invite-links";
import { ROLE_HELP } from "@/lib/invite-link-rules";
import { JoinInviteButton } from "@/components/JoinInviteButton";

export const metadata: Metadata = { title: "Join workspace · TaskFlow", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, session] = await Promise.all([previewInvite(token), auth()]);
  const next = encodeURIComponent(`/join/${token}`);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--surface)] p-6 text-center shadow-sm sm:p-8">
        {!preview.valid ? (
          <>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">Invite not available</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{preview.message}</p>
            <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-[var(--accent)] hover:underline">Go to TaskFlow</Link>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--muted)]">{preview.invitedBy ? `${preview.invitedBy} invited you to join` : "You're invited to join"}</p>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{preview.workspace.name}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {preview.workspace.memberCount} member{preview.workspace.memberCount === 1 ? "" : "s"} · you&apos;ll join as{" "}
              <span className="font-medium text-[var(--foreground)]">{ROLE_HELP[preview.role as keyof typeof ROLE_HELP]?.label ?? preview.role}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{ROLE_HELP[preview.role as keyof typeof ROLE_HELP]?.can}</p>
            {preview.emailRestricted && <p className="mt-3 text-xs text-[var(--muted)]">This invite only works for the email address it was sent to.</p>}
            <div className="mt-6">
              {session?.user ? (
                <JoinInviteButton token={token} workspaceName={preview.workspace.name} />
              ) : (
                <div className="flex flex-col gap-2">
                  <Link href={`/register?next=${next}`} className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Create free account &amp; join</Link>
                  <Link href={`/login?next=${next}`} className="rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]">I already have an account</Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
