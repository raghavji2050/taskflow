"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { forgotPasswordSchema } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { z } from "zod";

type FormInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: FormInput) => {
    setIsLoading(true);
    setDevResetUrl(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to send reset link");
      }

      setSent(true);
      if (result.devResetUrl) {
        setDevResetUrl(result.devResetUrl);
        toast.message("SMTP not configured — use the dev link below");
      } else {
        toast.success("Check your email for the reset link");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reset link");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AmbientBackground className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-8 shadow-[var(--shadow-md)]">
        <h1 className="mb-2 text-xl font-semibold text-[var(--foreground)]">Forgot Password</h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          {sent
            ? "If an account exists for that email, we sent a reset link."
            : "Enter your email to receive a reset link"}
        </p>

        {!sent ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
            <Button type="submit" className="w-full" variant="primary" isLoading={isLoading}>
              Send Reset Link
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            {devResetUrl && (
              <div className="surface-panel rounded-xl border border-[color-mix(in_oklab,var(--status-pinned)_40%,transparent)] p-3 text-sm">
                <p className="mb-2 font-medium text-[var(--status-pinned)]">Dev reset link</p>
                <a href={devResetUrl} className="break-all text-[var(--accent)] hover:underline">
                  {devResetUrl}
                </a>
              </div>
            )}
            <Button variant="secondary" className="w-full" onClick={() => { setSent(false); setDevResetUrl(null); }}>
              Send again
            </Button>
          </div>
        )}

        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">Back to login</Link>
        </p>
      </Card>
    </AmbientBackground>
  );
}
