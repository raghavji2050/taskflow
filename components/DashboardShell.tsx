"use client";

import { Suspense } from "react";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { ActiveTimerProvider } from "@/components/ActiveTimerProvider";
import { AppSidebar } from "@/components/AppSidebar";
import { TeamContextBar } from "@/components/TeamContextBar";
import { NotificationListener } from "@/components/NotificationListener";
import { PushBootstrap } from "@/components/PushBootstrap";
import { ChatNotificationCatchup } from "@/components/ChatNotificationCatchup";
import { TimeTrackingBar } from "@/components/TimeTrackingBar";
import { IdleTimerProvider } from "@/components/IdleTimerProvider";
import { TimerReminderWatcher } from "@/components/TimerReminderWatcher";
import { AmbientBackground } from "@/components/ui/AmbientBackground";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <ActiveTimerProvider>
        <NotificationListener />
        <PushBootstrap />
        <ChatNotificationCatchup />
        <AmbientBackground>
          <div className="app-mesh-content flex min-h-[100dvh] flex-col lg:flex-row">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Suspense fallback={null}>
                <TeamContextBar />
              </Suspense>
              <TimeTrackingBar />
              <IdleTimerProvider />
              <TimerReminderWatcher />
              <main className="flex-1 overflow-auto max-lg:touch-pan-y">
                <div className="dashboard-main px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </AmbientBackground>
      </ActiveTimerProvider>
    </WorkspaceProvider>
  );
}
