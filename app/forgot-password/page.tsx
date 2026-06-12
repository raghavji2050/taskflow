"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { forgotPasswordSchema } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
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
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-2 text-xl font-bold">Forgot Password</h1>
        <p className="mb-6 text-sm text-zinc-500">
          {sent
            ? "If an account exists for that email, we sent a reset link."
            : "Enter your email to receive a reset link"}
        </p>

        {!sent ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Send Reset Link
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            {devResetUrl && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                <p className="mb-2 font-medium text-amber-800 dark:text-amber-200">Dev reset link</p>
                <a href={devResetUrl} className="break-all text-indigo-600 hover:underline dark:text-indigo-400">
                  {devResetUrl}
                </a>
              </div>
            )}
            <Button variant="secondary" className="w-full" onClick={() => { setSent(false); setDevResetUrl(null); }}>
              Send again
            </Button>
          </div>
        )}

        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link href="/login" className="text-indigo-500 hover:underline">Back to login</Link>
        </p>
      </Card>
    </div>
  );
}
