"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { profileSchema, passwordSchema } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/PageHeader";
import { PushSubscribe } from "@/components/PushSubscribe";
import { TimeTrackingSettingsCard } from "@/components/TimeTrackingSettingsCard";
import { z } from "zod";

type ProfileInput = z.infer<typeof profileSchema>;
type PasswordInput = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { update: updateSession } = useSession();
  const [user, setUser] = useState<{
    name: string;
    email: string;
    hasPassword?: boolean;
    oauthProviders?: string[];
  } | null>(null);
  const [pendingScheduledCount, setPendingScheduledCount] = useState(0);

  const profileForm = useForm<ProfileInput>({ resolver: zodResolver(profileSchema) });
  const passwordForm = useForm<PasswordInput>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setUser(d.user);
          profileForm.reset({ name: d.user.name });
        }
      });
    fetch("/api/conversations/scheduled-messages?status=PENDING&limit=1")
      .then((r) => r.json())
      .then((d) => {
        if (d.pagination?.total != null) setPendingScheduledCount(d.pagination.total);
      })
      .catch(() => undefined);
  }, [profileForm]);

  const onProfileSubmit = async (data: ProfileInput) => {
    const res = await fetch("/api/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success("Profile updated");
      setUser((u) => (u ? { ...u, name: data.name } : u));
      await updateSession();
    } else toast.error((await res.json()).error);
  };

  const onPasswordSubmit = async (data: PasswordInput) => {
    const res = await fetch("/api/user/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success("Password updated. Please sign in again.");
      passwordForm.reset();
      await signOut({ callbackUrl: "/login" });
    } else toast.error((await res.json()).error);
  };

  const [signingOutAll, setSigningOutAll] = useState(false);
  const onSignOutEverywhere = async () => {
    if (!window.confirm("Sign out of Taskflow on all devices, including this one?")) return;
    setSigningOutAll(true);
    const res = await fetch("/api/user/sessions", { method: "DELETE" });
    if (res.ok) {
      toast.success("Signed out of all devices");
      await signOut({ callbackUrl: "/login" });
    } else {
      setSigningOutAll(false);
      toast.error((await res.json()).error ?? "Could not sign out of all devices");
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        className="mb-6"
        title="Settings"
        subtitle="Manage your profile, notifications, and account security"
      />

      <Card className="mb-6 p-6">
        <h2 className="section-label mb-4">
          Profile
        </h2>
        {user && <p className="mb-4 text-sm text-[var(--muted)]">{user.email}</p>}
        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
          <Input
            label="Name"
            error={profileForm.formState.errors.name?.message}
            {...profileForm.register("name")}
          />
          <Button type="submit">Save Profile</Button>
        </form>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="section-label mb-2">Scheduled Messages</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          View and manage chat messages scheduled to send later.
        </p>
        <Link href="/settings/scheduled-messages">
          <Button variant="secondary" className="gap-2">
            <Clock className="h-4 w-4" />
            Manage scheduled messages
            {pendingScheduledCount > 0 && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                {pendingScheduledCount}
              </span>
            )}
          </Button>
        </Link>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="section-label mb-4">
          Notifications
        </h2>
        <PushSubscribe />
      </Card>

      <TimeTrackingSettingsCard />

      {user?.hasPassword ? (
        <Card className="p-6">
          <h2 className="section-label mb-4">
            Change Password
          </h2>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register("currentPassword")}
            />
            <Input
              label="New Password"
              type="password"
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register("newPassword")}
            />
            <Button type="submit">Update Password</Button>
          </form>
        </Card>
      ) : user?.oauthProviders && user.oauthProviders.length > 0 ? (
        <Card className="p-6">
          <h2 className="section-label mb-2">
            Sign-in method
          </h2>
          <p className="text-sm text-[var(--muted)]">
            You sign in with{" "}
            {user.oauthProviders.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" or ")}.
            Password login is not used for this account.
          </p>
        </Card>
      ) : null}

      <Card className="mt-6 p-6">
        <h2 className="section-label mb-2">Active sessions</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Lost a phone or used a shared computer? Sign out everywhere. Sessions also expire after
          14 days, and changing or resetting your password signs out all devices.
        </p>
        <Button type="button" variant="danger" onClick={onSignOutEverywhere} disabled={signingOutAll}>
          {signingOutAll ? "Signing out..." : "Sign out of all devices"}
        </Button>
      </Card>
    </div>
  );
}
