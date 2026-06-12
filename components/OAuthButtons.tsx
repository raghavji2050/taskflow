"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

interface OAuthButtonsProps {
  callbackUrl?: string;
}

export function OAuthButtons({ callbackUrl = "/dashboard" }: OAuthButtonsProps) {
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((data) => {
        setProviders(data.providers ?? []);
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, []);

  const handleOAuth = async (provider: "google" | "github") => {
    setLoading(provider);
    try {
      const result = await signIn(provider, { callbackUrl, redirect: false });
      if (result?.error) {
        toast.error(
          result.error === "Configuration"
            ? `${provider === "google" ? "Google" : "GitHub"} login is not configured on the server`
            : "Sign in failed. Please try again."
        );
        setLoading(null);
        return;
      }
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch {
      toast.error("Sign in failed. Please try again.");
      setLoading(null);
    }
  };

  if (!checked) return null;
  if (providers.length === 0) return null;

  return (
    <>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-zinc-400 dark:bg-zinc-900">or continue with</span>
        </div>
      </div>

      <div className={providers.length === 1 ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
        {providers.includes("google") && (
          <Button
            type="button"
            variant="secondary"
            isLoading={loading === "google"}
            onClick={() => handleOAuth("google")}
          >
            Google
          </Button>
        )}
        {providers.includes("github") && (
          <Button
            type="button"
            variant="secondary"
            isLoading={loading === "github"}
            onClick={() => handleOAuth("github")}
          >
            GitHub
          </Button>
        )}
      </div>
    </>
  );
}
