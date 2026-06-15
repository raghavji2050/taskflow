"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SessionGuard } from "@/components/SessionGuard";
import { RealtimeProvider } from "@/components/RealtimeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={false}>
      <SessionGuard>
        <RealtimeProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
        </RealtimeProvider>
      </SessionGuard>
    </SessionProvider>
  );
}
