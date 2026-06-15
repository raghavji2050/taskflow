"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckSquare } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { OAuthButtons } from "@/components/OAuthButtons";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (!error) return;
    const messages: Record<string, string> = {
      Configuration: "Google/GitHub login is not configured. Add OAuth keys to your environment.",
      AccessDenied: "Access denied. You may not have permission to sign in.",
      OAuthSignin: "Could not start OAuth sign in. Check your OAuth app settings.",
      OAuthCallback: "OAuth callback failed. Verify redirect URI in Google Cloud Console.",
      OAuthAccountNotLinked: "This email is already linked to another sign-in method.",
      Default: "Sign in failed. Please try again.",
    };
    toast.error(messages[error] ?? messages.Default);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);

    try {
      const signInResult = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (signInResult?.error) {
        if (signInResult.error === "CredentialsSignin") {
          throw new Error("Invalid email or password");
        }
        throw new Error("Sign in failed. Please try again.");
      }

      if (!signInResult?.ok) {
        throw new Error("Sign in failed. Please try again.");
      }

      window.location.href = "/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-1">
      {/* Brand panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-[var(--accent)] p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <CheckSquare className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-bold">TaskFlow</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold leading-tight">
            Manage work the way modern teams do.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/80">
            Lists, boards, calendars, and timelines — all in one place. Collaborate with your team and stay on top of every deadline.
          </p>
        </div>
        <p className="text-sm text-white/60">Trusted by teams who ship fast.</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm border-0 p-8 shadow-lg sm:border sm:shadow-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Welcome back</h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">Sign in to continue to TaskFlow</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register("email")}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              error={errors.password?.message}
              {...register("password")}
            />

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs font-medium text-[var(--accent)] hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              Sign In
            </Button>
          </form>

          <OAuthButtons callbackUrl="/dashboard" />

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-[var(--accent)] hover:underline">
              Create one
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
