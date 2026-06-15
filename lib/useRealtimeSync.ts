"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useRealtime } from "@/components/RealtimeProvider";
import type { TaskEvent } from "@/lib/realtime";

interface UseRealtimeSyncOptions {
  workspaceId: string | null;
  onRefresh: () => void;
  enabled?: boolean;
  notifyOnRemote?: boolean;
  refreshOnAnyTaskEvent?: boolean;
}

export function useRealtimeSync({
  workspaceId,
  onRefresh,
  enabled = true,
  notifyOnRemote = true,
  refreshOnAnyTaskEvent = false,
}: UseRealtimeSyncOptions) {
  const { data: session } = useSession();
  const { subscribe } = useRealtime();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || !session?.user) return;

    return subscribe((data: TaskEvent) => {
      if (refreshOnAnyTaskEvent) {
        onRefreshRef.current();
        return;
      }
      const eventWorkspace = data.workspaceId ?? null;
      if (eventWorkspace !== workspaceId) return;

      onRefreshRef.current();

      if (
        notifyOnRemote &&
        data.actorId &&
        data.actorId !== session.user?.id
      ) {
        toast.info(
          workspaceId ? "Team tasks updated" : "Tasks updated",
          { duration: 2000 }
        );
      }
    });
  }, [enabled, session?.user, workspaceId, notifyOnRemote, subscribe, refreshOnAnyTaskEvent]);
}
