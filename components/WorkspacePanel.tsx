"use client";

import { useState } from "react";
import { Mail, Users } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export function WorkspacePanel() {
  const { isPersonal, selectedWorkspace, members, inviteMember } = useWorkspace();
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  if (isPersonal) return null;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    const ok = await inviteMember(inviteEmail.trim());
    if (ok) {
      toast.success("Member invited");
      setInviteEmail("");
    } else {
      toast.error("Could not invite member");
    }
    setIsInviting(false);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Team Members</h3>
        </div>
        <span className="text-xs text-zinc-400">{members.length} members</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {members.map((m) => (
          <span
            key={m.user.id}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs dark:bg-zinc-800"
          >
            <span className="font-medium">{m.user.name}</span>
            <span className="text-zinc-400">· {m.role}</span>
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            hideLabel
            type="email"
            placeholder="Invite by email..."
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button size="sm" onClick={handleInvite} isLoading={isInviting} className="h-9 shrink-0 sm:px-4">
          Invite
        </Button>
      </div>

      {selectedWorkspace && (
        <p className="mt-2.5 text-xs text-zinc-400">
          Tasks in <span className="font-medium text-zinc-500">{selectedWorkspace.name}</span> are visible to all members
        </p>
      )}
    </Card>
  );
}
