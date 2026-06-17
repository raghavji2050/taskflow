"use client";

import { Suspense } from "react";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { AppSidebar } from "@/components/AppSidebar";
import { TeamContextBar } from "@/components/TeamContextBar";
import { NotificationListener } from "@/components/NotificationListener";
import { PushBootstrap } from "@/components/PushBootstrap";
import { ChatNotificationCatchup } from "@/components/ChatNotificationCatchup";
import { TimeTrackingBar } from "@/components/TimeTrackingBar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <NotificationListener />
      <PushBootstrap />
      <ChatNotificationCatchup />
      <div className="flex min-h-[calc(100dvh)] flex-col lg:flex-row">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={null}>
            <TeamContextBar />
          </Suspense>
          <TimeTrackingBar />
          <main className="flex-1 overflow-auto max-lg:touch-pan-y">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
