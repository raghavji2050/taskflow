import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/metadata";
import { TEMPLATE_GUIDES } from "@/lib/templates";

const title = "Free project templates and setup guides | TaskFlow";
const description =
  "Step-by-step TaskFlow setups for sprint planning, client projects, content calendars, bug tracking and daily to-do lists.";

export const metadata: Metadata = createPageMetadata({
  title,
  absoluteTitle: title,
  description,
  path: "/templates",
});

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Templates and setup guides</h1>
      <p className="mt-3 text-[var(--muted)]">{description}</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {TEMPLATE_GUIDES.map((g) => (
          <li key={g.slug} className="rounded-lg border border-[var(--border)] p-4">
            <Link href={`/templates/${g.slug}`} className="font-medium text-[var(--accent)] underline">
              {g.h1}
            </Link>
            <p className="mt-2 text-sm text-[var(--muted)]">{g.intro}</p>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/register" className="font-medium text-[var(--accent)] underline">Create a free account</Link>
        <Link href="/help" className="text-[var(--accent)] underline">Help center</Link>
        <Link href="/" className="text-[var(--accent)] underline">Home</Link>
      </div>
    </main>
  );
}
