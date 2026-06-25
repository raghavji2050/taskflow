"use client";

import { MOBILE_APP_BAR_HEIGHT, useMediaQuery, useVisualViewport } from "@/lib/use-visual-viewport";

export function MessagesViewportShell({ children }: { children: React.ReactNode }) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const vv = useVisualViewport();

  if (!isMobile) {
    return (
      <div className="absolute inset-0 flex min-h-0 w-full min-w-0 flex-col overflow-hidden">
        {children}
      </div>
    );
  }

  const top = vv.offsetTop + MOBILE_APP_BAR_HEIGHT;
  const height = Math.max(0, vv.height - MOBILE_APP_BAR_HEIGHT);

  return (
    <div
      className="fixed left-0 right-0 z-30 flex min-h-0 w-full min-w-0 flex-col overflow-hidden"
      style={{ top, height }}
    >
      {children}
    </div>
  );
}
