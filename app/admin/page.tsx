import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/PageHeader";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Admin",
  "Manage users and application settings."
);

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const admin = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (admin?.role !== "ADMIN") redirect("/dashboard");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true, _count: { select: { tasks: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="app-mesh-bg mx-auto min-h-[calc(100dvh-4rem)] max-w-4xl px-4 py-8">
      <PageHeader title="Admin Panel" subtitle="Manage users and roles" className="mb-6" />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-3)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Tasks</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">{user._count.tasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
