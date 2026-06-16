import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createPageMetadata, SITE_DESCRIPTION } from "@/lib/metadata";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Columns3,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = createPageMetadata({
  title: "Task & team management",
  description: SITE_DESCRIPTION,
});

const features = [
  {
    icon: CheckCircle2,
    title: "Task Management",
    description: "Create, assign, and track tasks across personal and team workspaces.",
    color: "bg-violet-500/10 text-violet-600",
  },
  {
    icon: Columns3,
    title: "Multiple Views",
    description: "Switch between List, Board, Calendar, Timeline, and My Work instantly.",
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Multi-assignees, comments, @mentions, and role-based permissions.",
    color: "bg-emerald-500/10 text-emerald-600",
  },
  {
    icon: Zap,
    title: "Automations",
    description: "Rules for overdue tasks, status changes, and due-date reminders.",
    color: "bg-amber-500/10 text-amber-600",
  },
  {
    icon: BarChart3,
    title: "Workload Insights",
    description: "See team capacity and task distribution at a glance.",
    color: "bg-rose-500/10 text-rose-600",
  },
  {
    icon: Sparkles,
    title: "Real-time Sync",
    description: "Live updates across views so your team always stays aligned.",
    color: "bg-indigo-500/10 text-indigo-600",
  },
];

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[var(--card-border)]">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 via-transparent to-blue-600/5" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-3xl text-center animate-fade-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--card)] px-4 py-1.5 text-sm font-medium text-[var(--muted)] shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              Professional project management
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
              Work smarter with{" "}
              <span className="text-[var(--accent)]">TaskFlow</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-[var(--muted)]">
              Plan, track, and deliver work — from personal to-do lists to full team projects.
              Built for teams who want Asana-level clarity without the complexity.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="min-w-[160px]">
                  Start for free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary" size="lg" className="min-w-[160px]">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>

          {/* Mock dashboard preview */}
          <div className="mx-auto mt-16 max-w-4xl animate-fade-up" style={{ animationDelay: "0.15s" }}>
            <div className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-[var(--card-border)] bg-[var(--surface-hover)] px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="ml-2 text-xs text-[var(--muted)]">TaskFlow — Team Board</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-5">
                {["To Do", "In Progress", "Done"].map((col, i) => (
                  <div key={col} className="rounded-xl bg-[var(--background)] p-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{col}</p>
                    {[0, 1].slice(0, i === 2 ? 1 : 2).map((j) => (
                      <div key={j} className="mb-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-sm">
                        <div className="h-2 w-3/4 rounded bg-[var(--surface-hover)]" />
                        <div className="mt-2 flex gap-1">
                          <div className="h-4 w-12 rounded-full bg-violet-500/20" />
                          <div className="h-4 w-4 rounded-full bg-[var(--accent)]/30" />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything your team needs</h2>
          <p className="mt-3 text-[var(--muted)]">One platform for tasks, teams, and timelines.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6 transition-shadow hover:shadow-md">
              <div className={`mb-4 inline-flex rounded-xl p-3 ${feature.color}`}>
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-[var(--foreground)]">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[var(--card-border)] bg-[var(--card)]">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight">Ready to get organized?</h2>
          <p className="mt-3 text-[var(--muted)]">Join TaskFlow and bring clarity to your work.</p>
          <Link href="/register" className="mt-6 inline-block">
            <Button size="lg">Create your workspace</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
