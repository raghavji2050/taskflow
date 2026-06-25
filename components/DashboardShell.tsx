"use client";

import { Suspense } from "react";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { ActiveTimerProvider } from "@/components/ActiveTimerProvider";
import { AppSidebar } from "@/components/AppSidebar";
import { TeamContextBar } from "@/components/TeamContextBar";
import { NotificationListener } from "@/components/NotificationListener";
import { PushBootstrap } from "@/components/PushBootstrap";
import { TimeTrackingBar } from "@/components/TimeTrackingBar";
import { IdleTimerProvider } from "@/components/IdleTimerProvider";
import { TimerReminderWatcher } from "@/components/TimerReminderWatcher";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { MobileSidebarProvider } from "@/components/MobileSidebarProvider";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <ActiveTimerProvider>
        <NotificationListener />
        <PushBootstrap />
        <MobileSidebarProvider>
        <AmbientBackground>
          <div className="app-mesh-content flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden lg:flex-row">
            <AppSidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Suspense fallback={null}>
                <TeamContextBar />
              </Suspense>
              <TimeTrackingBar />
              <IdleTimerProvider />
              <TimerReminderWatcher />
              <main className="flex min-h-0 flex-1 flex-col overflow-hidden max-lg:touch-pan-y">
                <div className="dashboard-main flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </AmbientBackground>
        </MobileSidebarProvider>
      </ActiveTimerProvider>
    </WorkspaceProvider>
  );
}
