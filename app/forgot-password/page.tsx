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
  const { register, handleSubmit, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: FormInput) => {
    setIsLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const result = await res.json();
    toast.success(result.message);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-2 text-xl font-bold">Forgot Password</h1>
        <p className="mb-6 text-sm text-zinc-500">Enter your email to receive a reset link</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
          <Button type="submit" className="w-full" isLoading={isLoading}>Send Reset Link</Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link href="/login" className="text-indigo-500 hover:underline">Back to login</Link>
        </p>
      </Card>
    </div>
  );
}
