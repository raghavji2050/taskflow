"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckSquare } from "lucide-react";
import { registerSchema, type RegisterInput } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { OAuthButtons } from "@/components/OAuthButtons";

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Registration failed");

      const signInResult = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (signInResult?.error) {
        toast.success("Account created! Please sign in.");
        router.push("/login");
        return;
      }

      window.location.href = "/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-1">
      <div className="hidden w-1/2 flex-col justify-between bg-[var(--accent)] p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <CheckSquare className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-bold">TaskFlow</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold leading-tight">
            Start organizing work in minutes.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/80">
            Create your free account and get access to lists, boards, calendars, team workspaces, and more.
          </p>
        </div>
        <p className="text-sm text-white/60">Free to get started. No credit card required.</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm border-0 p-8 shadow-lg sm:border sm:shadow-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Create account</h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">Get started for free</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Name" placeholder="Your name" error={errors.name?.message} {...register("name")} />
            <Input label="Email" type="email" placeholder="you@example.com" error={errors.email?.message} {...register("email")} />
            <Input label="Password" type="password" placeholder="At least 6 characters" error={errors.password?.message} {...register("password")} />
            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>Create Account</Button>
          </form>

          <OAuthButtons callbackUrl="/dashboard" />

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[var(--accent)] hover:underline">Sign in</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
