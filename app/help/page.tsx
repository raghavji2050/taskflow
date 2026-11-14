import Link from "next/link";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import { HELP_ARTICLES } from "@/lib/marketing";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = createPageMetadata({
  title: "Help center",
  description: "Guides for getting started with TaskFlow: workspaces, team invites, views, billing, API and security.",
});

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Help center</h1>
      <p className="mt-2 text-[var(--muted)]">Short guides to get your team running on TaskFlow.</p>

      <nav aria-label="Help topics" className="mt-8 grid gap-3 sm:grid-cols-2">
        {HELP_ARTICLES.map((a) => (
          <a key={a.id} href={`#${a.id}`} className="surface-panel rounded-xl p-4 hover:ring-1 hover:ring-[var(--accent)]">
            <span className="font-medium">{a.title}</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">{a.summary}</span>
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-6">
        {HELP_ARTICLES.map((a) => (
          <section key={a.id} id={a.id} className="scroll-mt-20">
          <Card className="p-6">
            <h2 className="text-xl font-semibold">{a.title}</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              {a.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Card>
          </section>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/register" className="font-medium text-[var(--accent)] underline">Create a free account</Link>
        <Link href="/docs" className="text-[var(--accent)] underline">API reference</Link>
        <Link href="/" className="text-[var(--accent)] underline">Home</Link>
      </div>
    </div>
  );
}
