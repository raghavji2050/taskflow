"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SessionGuard } from "@/components/SessionGuard";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { MotionProvider } from "@/components/motion";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={false}>
      <SessionGuard>
        <RealtimeProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <MotionProvider>
          {children}
          <Toaster
            richColors
            position="top-right"
            closeButton
            toastOptions={{
              classNames: {
                toast: "surface-panel border border-[var(--border)] shadow-md",
              },
            }}
          />
          </MotionProvider>
        </ThemeProvider>
        </RealtimeProvider>
      </SessionGuard>
    </SessionProvider>
  );
}
