"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetPasswordSchema } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { z } from "zod";

type FormInput = z.infer<typeof resetPasswordSchema>;

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = async (data: FormInput) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Reset failed");
      router.push("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <Card className="w-full max-w-sm p-8 text-center">
        <h1 className="mb-2 text-xl font-bold">Invalid link</h1>
        <p className="mb-4 text-sm text-zinc-500">This reset link is missing or expired.</p>
        <a href="/forgot-password" className="text-sm text-indigo-500 hover:underline">
          Request a new link
        </a>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-8">
      <h1 className="mb-6 text-xl font-bold">Reset Password</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input type="hidden" {...register("token")} />
        <Input label="New Password" type="password" error={errors.password?.message} {...register("password")} />
        <Button type="submit" className="w-full" isLoading={isLoading}>Reset Password</Button>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Suspense><ResetForm /></Suspense>
    </div>
  );
}
