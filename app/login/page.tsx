"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Welcome back</h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to your account
          </p>
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
            <Link href="/forgot-password" className="text-xs text-indigo-500 hover:underline">Forgot password?</Link>
          </div>

          <Button type="submit" className="w-full" isLoading={isLoading}>
            Sign In
          </Button>
        </form>

        <OAuthButtons callbackUrl="/dashboard" />

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Create one
          </Link>
        </p>
      </Card>
    </div>
  );
}
