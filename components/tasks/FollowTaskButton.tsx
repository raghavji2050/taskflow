"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

type Follower = { id: string; name: string };

export function FollowTaskButton({ taskId }: { taskId: string }) {
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/followers`);
    if (!res.ok) return;
    const data = await res.json();
    setFollowers(data.followers ?? []);
    setFollowing(!!data.following);
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    setBusy(true);
    const res = await fetch(`/api/tasks/${taskId}/followers`, {
      method: following ? "DELETE" : "POST",
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not update follow status");
      return;
    }
    const data = await res.json();
    setFollowers(data.followers ?? []);
    setFollowing(!!data.following);
    toast.success(data.following ? "You'll be notified about this task" : "Unfollowed task");
  };

  const names = followers.map((f) => f.name).join(", ");

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="task-followers">
      <Button
        variant={following ? "secondary" : "ghost"}
        size="sm"
        className="h-8"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
      >
        {following ? <BellOff className="mr-1.5 h-3.5 w-3.5" /> : <Bell className="mr-1.5 h-3.5 w-3.5" />}
        {following ? "Unfollow" : "Follow"}
      </Button>
      <span className="text-xs text-[var(--muted)]" title={names}>
        {followers.length === 0
          ? "No followers yet"
          : `${followers.length} follower${followers.length === 1 ? "" : "s"}: ${names}`}
      </span>
    </div>
  );
}
