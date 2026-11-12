"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, User, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useWorkspace } from "@/components/WorkspaceProvider";

type Step = "use" | "task" | "workspace" | "invite";

async function patchOnboarding(body: object) {
  await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

export function WelcomeWizard() {
  const router = useRouter();
  const { createWorkspace, selectWorkspace, inviteMember } = useWorkspace();
  const [step, setStep] = useState<Step>("use");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [wsName, setWsName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");

  const choose = async (useCase: "personal" | "team") => {
    await patchOnboarding({ useCase, dismissed: false });
    if (useCase === "personal") selectWorkspace(null);
    setStep(useCase === "personal" ? "task" : "workspace");
  };
  const finish = () => router.push("/dashboard");

  const addTask = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), priority: "MEDIUM", status: "PENDING" }) });
    setBusy(false);
    if (!res.ok) return toast.error("Could not add the task");
    toast.success("First task added 🎉");
    finish();
  };
  const addSamples = async () => {
    setBusy(true);
    await fetch("/api/onboarding/sample-tasks", { method: "POST" });
    setBusy(false);
    toast.success("Added sample tasks");
    finish();
  };
  const makeWorkspace = async () => {
    if (!wsName.trim()) return;
    setBusy(true);
    const r = await createWorkspace(wsName.trim());
    setBusy(false);
    if (!r.ok || !r.workspace) return toast.error(r.error ?? "Could not create workspace");
    selectWorkspace(r.workspace.id);
    setStep("invite");
  };
  const invite = async () => {
    if (!email.trim()) return finish();
    setBusy(true);
    const r = await inviteMember(email.trim(), role);
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "Could not invite");
    toast.success(r.pendingSignup && !r.emailSent ? "Invite link created — share it from Team settings" : `Invite sent to ${email.trim()}`);
    finish();
  };

  const stepNo = { use: 1, task: 2, workspace: 2, invite: 3 }[step];
  const total = step === "task" ? 2 : 3;

  return (
    <div className="mx-auto max-w-xl py-6">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Step {stepNo} of {total}</p>
      <Card className="mt-2 p-5 sm:p-6">
        {step === "use" && (
          <>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">Welcome to TaskFlow 👋</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">How will you use it? You can change this later.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void choose("personal")} className="rounded-xl border border-[var(--border)] p-4 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
                <User className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                <span className="mt-2 block font-medium text-[var(--foreground)]">Just me</span>
                <span className="block text-xs text-[var(--muted)]">Personal to-dos, reminders and focus</span>
              </button>
              <button type="button" onClick={() => void choose("team")} className="rounded-xl border border-[var(--border)] p-4 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
                <Users className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                <span className="mt-2 block font-medium text-[var(--foreground)]">With my team</span>
                <span className="block text-xs text-[var(--muted)]">Shared projects, boards, goals and chat</span>
              </button>
            </div>
            <button type="button" onClick={finish} className="mt-4 text-xs text-[var(--muted)] underline-offset-2 hover:underline">Skip for now</button>
          </>
        )}
        {step === "task" && (
          <>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">What’s the first thing on your list?</h1>
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void addTask(); }}>
              <Input id="welcome-task" label="First task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pay electricity bill" autoFocus />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" isLoading={busy} disabled={!title.trim()}>Add task</Button>
                <Button type="button" variant="secondary" onClick={() => void addSamples()}><Sparkles className="h-4 w-4" />Show me with sample tasks</Button>
              </div>
            </form>
          </>
        )}
        {step === "workspace" && (
          <>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">Name your team workspace</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Usually your company or team name.</p>
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void makeWorkspace(); }}>
              <Input id="welcome-workspace" label="Workspace name" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="e.g. Acme Studio" autoFocus />
              <Button type="submit" isLoading={busy} disabled={!wsName.trim()}>Create workspace</Button>
            </form>
          </>
        )}
        {step === "invite" && (
          <>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">Invite a teammate</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">No account needed — they get a join link by email. You can also share a link from Team settings.</p>
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void invite(); }}>
              <Input id="welcome-invite" type="email" label="Teammate email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              <Select id="welcome-role" label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: "MEMBER", label: "Member" }, { value: "ADMIN", label: "Admin" }, { value: "VIEWER", label: "Viewer" }]} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" isLoading={busy} disabled={!email.trim()}>Send invite</Button>
                <Button type="button" variant="secondary" onClick={finish}>I’ll do it later</Button>
              </div>
            </form>
          </>
        )}
        {step !== "use" && (
          <button type="button" onClick={() => setStep(step === "invite" ? "workspace" : "use")} className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
            <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Back
          </button>
        )}
      </Card>
    </div>
  );
}
