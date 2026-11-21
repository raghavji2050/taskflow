import Link from "next/link";
import { TEMPLATE_GUIDES, type TemplateGuide } from "@/lib/templates";

export function TemplatePage({ data }: { data: TemplateGuide }) {
  const others = TEMPLATE_GUIDES.filter((g) => g.slug !== data.slug);
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">{data.h1}</h1>
      <p className="mt-3 text-[var(--muted)]">{data.intro}</p>

      <section aria-labelledby="setup" className="mt-8">
        <h2 id="setup" className="text-xl font-semibold">How to set it up in TaskFlow</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {data.steps.map((s) => (<li key={s}>{s}</li>))}
        </ol>
      </section>

      <section aria-labelledby="example" className="mt-8">
        <h2 id="example" className="text-xl font-semibold">Example sections and tasks</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {data.example.map((e) => (
            <div key={e.section} className="rounded-lg border border-[var(--border)] p-4">
              <h3 className="font-medium">{e.section}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {e.tasks.map((t) => (<li key={t}>{t}</li>))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 rounded-lg border border-[var(--border)] p-5">
        <p className="font-medium">Try this setup in TaskFlow</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Free for up to 5 members and 5 projects per workspace, no card needed.</p>
        <Link href="/register" className="mt-3 inline-block font-medium text-[var(--accent)] underline">Create a free account</Link>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/templates" className="text-[var(--accent)] underline">All templates</Link>
        {others.map((o) => (
          <Link key={o.slug} href={`/templates/${o.slug}`} className="text-[var(--accent)] underline">{o.h1}</Link>
        ))}
        <Link href="/help" className="text-[var(--accent)] underline">Help center</Link>
      </div>
    </main>
  );
}
