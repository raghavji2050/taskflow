import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Filter, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const features = [
  {
    icon: CheckCircle2,
    title: "Task Management",
    description: "Create, edit, delete, and mark tasks as complete with ease.",
  },
  {
    icon: Filter,
    title: "Smart Filtering",
    description: "Search, filter by status and priority, and sort by due date.",
  },
  {
    icon: Shield,
    title: "Secure Authentication",
    description: "Protected routes with bcrypt password hashing and session auth.",
  },
  {
    icon: Sparkles,
    title: "Beautiful Dashboard",
    description: "Track stats, completion rate, and recent activity at a glance.",
  },
];

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1">
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            Full-stack Next.js Task Manager
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-6xl dark:text-zinc-100">
            Organize your work with TaskFlow
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            A professional to-do application built with Next.js, Prisma, MySQL, and
            NextAuth. Manage priorities, due dates, and progress from one dashboard.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/register">
              <Button size="lg">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="lg">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6">
              <div className="mb-4 inline-flex rounded-xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <feature.icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
