"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { profileSchema, passwordSchema } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { PushSubscribe } from "@/components/PushSubscribe";
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

  const profileForm = useForm<ProfileInput>({ resolver: zodResolver(profileSchema) });
  const passwordForm = useForm<PasswordInput>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    fetch("/api/user/profile").then((r) => r.json()).then((d) => {
      if (d.user) { setUser(d.user); profileForm.reset({ name: d.user.name }); }
    });
  }, [profileForm]);

  const onProfileSubmit = async (data: ProfileInput) => {
    const res = await fetch("/api/user/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success("Profile updated");
      setUser((u) => (u ? { ...u, name: data.name } : u));
      await updateSession();
    }
    else toast.error((await res.json()).error);
  };

  const onPasswordSubmit = async (data: PasswordInput) => {
    const res = await fetch("/api/user/password", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    if (res.ok) { toast.success("Password updated"); passwordForm.reset(); }
    else toast.error((await res.json()).error);
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Profile</h2>
        {user && <p className="mb-4 text-sm text-zinc-500">{user.email}</p>}
        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
          <Input label="Name" error={profileForm.formState.errors.name?.message} {...profileForm.register("name")} />
          <Button type="submit">Save Profile</Button>
        </form>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Notifications</h2>
        <PushSubscribe />
      </Card>

      {user?.hasPassword ? (
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Change Password</h2>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <Input label="Current Password" type="password" error={passwordForm.formState.errors.currentPassword?.message} {...passwordForm.register("currentPassword")} />
            <Input label="New Password" type="password" error={passwordForm.formState.errors.newPassword?.message} {...passwordForm.register("newPassword")} />
            <Button type="submit">Update Password</Button>
          </form>
        </Card>
      ) : user?.oauthProviders && user.oauthProviders.length > 0 ? (
        <Card className="p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Sign-in method</h2>
          <p className="text-sm text-zinc-500">
            You sign in with{" "}
            {user.oauthProviders.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" or ")}.
            Password login is not used for this account.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
