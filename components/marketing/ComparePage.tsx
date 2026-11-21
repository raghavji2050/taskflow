import Link from "next/link";
import { COMPARE_AS_OF, COMPARISONS, type CompareData } from "@/lib/compare";

export function ComparePage({ data }: { data: CompareData }) {
  const others = COMPARISONS.filter((c) => c.slug !== data.slug);
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">TaskFlow vs {data.name}</h1>
      <p className="mt-3 text-[var(--muted)]">{data.intro}</p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Competitor details as of {COMPARE_AS_OF}, from{" "}
        <a href={data.sourceUrl} rel="noopener noreferrer" className="underline">
          {data.name}&apos;s public pages
        </a>
        . Plans and prices change, so check their site before deciding.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="sr-only">Feature comparison of TaskFlow and {data.name}</caption>
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th scope="col" className="py-2 pr-3 font-medium">Feature</th>
              <th scope="col" className="py-2 pr-3 font-medium">TaskFlow</th>
              <th scope="col" className="py-2 font-medium">{data.name}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.feature} className="border-b border-[var(--border)] align-top">
                <th scope="row" className="py-3 pr-3 font-medium">{r.feature}</th>
                <td className="py-3 pr-3">{r.taskflow}</td>
                <td className="py-3">{r.other}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="pick-tf">
          <h2 id="pick-tf" className="text-lg font-semibold">Pick TaskFlow if</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {data.pickTaskflow.map((p) => (<li key={p}>{p}</li>))}
          </ul>
        </section>
        <section aria-labelledby="pick-other">
          <h2 id="pick-other" className="text-lg font-semibold">Pick {data.name} if</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {data.pickOther.map((p) => (<li key={p}>{p}</li>))}
          </ul>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/register" className="font-medium text-[var(--accent)] underline">Create a free account</Link>
        {others.map((o) => (
          <Link key={o.slug} href={`/compare/${o.slug}`} className="text-[var(--accent)] underline">
            TaskFlow vs {o.name}
          </Link>
        ))}
        <Link href="/help" className="text-[var(--accent)] underline">Help center</Link>
        <Link href="/" className="text-[var(--accent)] underline">Home</Link>
      </div>
    </main>
  );
}
