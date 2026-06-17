"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { History, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { MomMeetingTimer } from "@/components/chat/mom/MomMeetingTimer";
import { MomWizardProgress, MOM_WIZARD_STEPS } from "@/components/chat/mom/MomWizardProgress";
import { MomActionTaskPicker } from "@/components/chat/mom/MomActionTaskPicker";
import { MomPreviousActionPicker, previousActionKey } from "@/components/chat/mom/MomPreviousActionPicker";
import { MomSuggestionField, MomSuggestionChips } from "@/components/chat/mom/MomSuggestionField";
import { defaultMomTitle } from "@/lib/mom-format";
import { linkedTaskToActionItemFields } from "@/lib/mom-action-task";
import {
  createEmptyMomContent,
  momContentHasData,
  normalizeMomContent,
  type MomActionItem,
  type MomDiscussionTopic,
  type MomStructuredContent,
} from "@/lib/mom-structured";
import { formatMomTimeRange, formatMomDueDate } from "@/lib/document-ui";
import { emptyMomSuggestionsMap, type MomSuggestionCategory, type MomSuggestionsMap } from "@/lib/mom-suggestions";
import {
  MOM_MEETING_CLOSE_MESSAGE,
  setMomMeetingInProgress,
} from "@/lib/mom-meeting-guard";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/WorkspaceProvider";

export interface MomBuilderConversation {
  id: string;
  type: string;
  workspaceId?: string | null;
  participants: { id: string; name: string }[];
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string) {
  return new Date(value).toISOString();
}

function toDateInputValue(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInputValue(value: string) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toISOString();
}

function defaultStartedLocal() {
  return toDatetimeLocalValue(new Date().toISOString());
}

interface MomBuilderModalProps {
  conversation: MomBuilderConversation;
  workspaceId?: string | null;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

function lastStringFilled(values: string[]) {
  if (values.length === 0) return true;
  return values[values.length - 1]!.trim().length > 0;
}

function applySuggestionToList(values: string[], text: string): string[] {
  const emptyIndex = values.findIndex((v) => !v.trim());
  if (emptyIndex >= 0) {
    const next = [...values];
    next[emptyIndex] = text;
    return next;
  }
  return [...values, text];
}

function ListField({
  label,
  description,
  values,
  onChange,
  placeholder,
  suggestions = [],
  suggestionCategory,
  onMutateSuggestion,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  suggestionCategory?: MomSuggestionCategory;
  onMutateSuggestion?: (action: "add" | "hide", value: string) => void | Promise<void>;
}) {
  const canAddMore = lastStringFilled(values);
  const filledValues = values.filter((v) => v.trim());
  const manageable = Boolean(suggestionCategory && onMutateSuggestion);

  return (
    <section className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-hover)]/20 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{label}</h3>
        {description && <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>}
      </div>
      {(suggestions.length > 0 || manageable) && (
        <MomSuggestionChips
          suggestions={suggestions}
          exclude={filledValues}
          onPick={(text) => onChange(applySuggestionToList(values, text))}
          manageable={manageable}
          onAddSuggestion={
            onMutateSuggestion ? (value) => onMutateSuggestion("add", value) : undefined
          }
          onHideSuggestion={
            onMutateSuggestion ? (value) => onMutateSuggestion("hide", value) : undefined
          }
        />
      )}
      <div className="space-y-2">
        {values.map((value, i) => (
          <div key={`${label}-${i}`} className="flex w-full gap-2">
            <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[10px] font-semibold text-[var(--muted)]">
              {i + 1}
            </span>
            <MomSuggestionField
              value={value}
              onChange={(next) => {
                const updated = [...values];
                updated[i] = next;
                onChange(updated);
              }}
              suggestions={suggestions}
              exclude={values.filter((_, idx) => idx !== i && values[idx]!.trim())}
              placeholder={placeholder ?? `Item ${i + 1}`}
              className="bg-[var(--background)]"
              manageable={manageable}
              onAddSuggestion={
                onMutateSuggestion ? (v) => onMutateSuggestion("add", v) : undefined
              }
              onHideSuggestion={
                onMutateSuggestion ? (v) => onMutateSuggestion("hide", v) : undefined
              }
            />
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                className="mt-1 shrink-0 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-red-500"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-1"
          disabled={!canAddMore}
          onClick={() => onChange([...values, ""])}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </section>
  );
}

export function MomBuilderModal({
  conversation,
  workspaceId = null,
  currentUserId,
  isOpen,
  onClose,
  onCreated,
}: MomBuilderModalProps) {
  const { data: session } = useSession();
  const { workspaces } = useWorkspace();
  const isPersonal = conversation.type === "PERSONAL";
  const isDirect = conversation.type === "DIRECT";
  const isGroupChat = conversation.type === "GROUP" || conversation.type === "WORKSPACE";
  const effectiveWorkspaceId = workspaceId ?? conversation.workspaceId ?? null;
  const canPickActionOwner = isGroupChat || Boolean(effectiveWorkspaceId);

  const actionOwnerOptions = useMemo(() => {
    if (effectiveWorkspaceId) {
      const ws = workspaces.find((w) => w.id === effectiveWorkspaceId);
      if (ws?.members.length) {
        return ws.members.map((m) => ({ id: m.user.id, name: m.user.name }));
      }
    }
    if (isGroupChat && conversation.participants.length > 0) {
      return conversation.participants;
    }
    return [];
  }, [effectiveWorkspaceId, workspaces, isGroupChat, conversation.participants]);
  const otherParticipants = useMemo(
    () => conversation.participants.filter((p) => p.id !== currentUserId),
    [conversation.participants, currentUserId]
  );

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [startedAt, setStartedAt] = useState(defaultStartedLocal);
  const [endedAt, setEndedAt] = useState("");
  const [content, setContent] = useState<MomStructuredContent>(() =>
    createEmptyMomContent(session?.user?.name ?? "")
  );
  const [note, setNote] = useState("");
  const [allAttendees, setAllAttendees] = useState(false);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>(() =>
    conversation.type === "DIRECT" && otherParticipants.length === 1
      ? [otherParticipants[0]!.id]
      : []
  );
  const [meetingActive, setMeetingActive] = useState(false);
  const [meetingPaused, setMeetingPaused] = useState(false);
  const [meetingElapsedOffset, setMeetingElapsedOffset] = useState(0);
  const [meetingStartedAt, setMeetingStartedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<MomSuggestionsMap>(() => emptyMomSuggestionsMap());
  const organizerName = session?.user?.name ?? (content.organizer || "You");
  const defaultActionOwner = useMemo(() => {
    if (isDirect && otherParticipants.length === 1) {
      return otherParticipants[0]!.name;
    }
    if (isPersonal) {
      return session?.user?.name ?? "";
    }
    return "";
  }, [isDirect, isPersonal, otherParticipants, session?.user?.name]);

  const makeActionItem = useCallback(
    (owner = defaultActionOwner): MomActionItem => ({
      id: crypto.randomUUID(),
      task: "",
      owner,
      dueDate: "",
      priority: "medium",
      status: "pending",
      createTask: true,
    }),
    [defaultActionOwner]
  );

  const reset = useCallback(() => {
    const now = new Date();
    setStep(0);
    setTitle(defaultMomTitle(now));
    setStartedAt(defaultStartedLocal());
    setEndedAt("");
    setContent(createEmptyMomContent(session?.user?.name ?? "", defaultActionOwner));
    setNote("");
    setAllAttendees(false);
    setSelectedAttendees(
      conversation.type === "DIRECT" && otherParticipants.length === 1
        ? [otherParticipants[0]!.id]
        : []
    );
    setMeetingActive(false);
    setMeetingPaused(false);
    setMeetingElapsedOffset(0);
    setMeetingStartedAt(null);
  }, [conversation.type, defaultActionOwner, otherParticipants, session?.user?.name]);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  useEffect(() => {
    if (!isOpen) return;
    const params = new URLSearchParams({ conversationId: conversation.id });
    if (effectiveWorkspaceId) params.set("workspaceId", effectiveWorkspaceId);
    void fetch(`/api/mom/suggestions?${params}`)
      .then((res) => res.json())
      .then((data: { suggestions?: MomSuggestionsMap }) => {
        if (data.suggestions) setSuggestions(data.suggestions);
      })
      .catch(() => {});
  }, [isOpen, effectiveWorkspaceId, conversation.id]);

  const mutateSuggestion = useCallback(
    async (category: MomSuggestionCategory, action: "add" | "hide", value: string) => {
      try {
        const res = await fetch("/api/mom/suggestions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: effectiveWorkspaceId, category, action, value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update suggestions");
        if (data.suggestions) setSuggestions(data.suggestions);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update suggestions");
      }
    },
    [effectiveWorkspaceId]
  );

  const toggleAttendee = (id: string) => {
    setSelectedAttendees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const startMeeting = () => {
    const now = new Date();
    setMeetingActive(true);
    setMeetingPaused(false);
    setMeetingElapsedOffset(0);
    setMeetingStartedAt(now);
    setStartedAt(toDatetimeLocalValue(now.toISOString()));
    setEndedAt("");
    toast.success("Meeting started");
  };

  const pauseMeeting = () => {
    if (!meetingStartedAt || meetingPaused) return;
    const elapsed =
      meetingElapsedOffset +
      Math.max(0, Math.floor((Date.now() - meetingStartedAt.getTime()) / 1000));
    setMeetingElapsedOffset(elapsed);
    setMeetingPaused(true);
    toast.success("Meeting paused");
  };

  const resumeMeeting = () => {
    if (!meetingActive || !meetingPaused) return;
    setMeetingStartedAt(new Date());
    setMeetingPaused(false);
    toast.success("Meeting resumed");
  };

  const stopMeeting = useCallback(() => {
    const now = new Date();
    setMeetingActive(false);
    setMeetingPaused(false);
    setMeetingElapsedOffset(0);
    setEndedAt(toDatetimeLocalValue(now.toISOString()));
  }, []);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (meetingActive && !meetingPaused) {
      if (!window.confirm(MOM_MEETING_CLOSE_MESSAGE)) return;
      stopMeeting();
    }
    onClose();
  }, [busy, meetingActive, meetingPaused, onClose, stopMeeting]);

  useEffect(() => {
    setMomMeetingInProgress(isOpen && meetingActive && !meetingPaused);
    return () => setMomMeetingInProgress(false);
  }, [isOpen, meetingActive, meetingPaused]);

  useEffect(() => {
    if (!isOpen || !meetingActive || meetingPaused) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isOpen, meetingActive, meetingPaused]);

  const updateContent = (patch: Partial<MomStructuredContent>) => {
    setContent((prev) => ({ ...prev, ...patch }));
  };


  const validateStep = (s: number) => {
    if (s === 0) {
      if (!title.trim()) {
        toast.error("Meeting title is required");
        return false;
      }
      return true;
    }
    if (s === 5) {
      if (!momContentHasData(normalizeMomContent(content))) {
        toast.error("Add at least one agenda item, discussion point, decision, or action");
        return false;
      }
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, MOM_WIZARD_STEPS.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const goToStep = (index: number) => {
    if (index < 0 || index >= MOM_WIZARD_STEPS.length) return;
    setStep(index);
  };

  const submit = async () => {
    if (busy || !validateStep(0) || !validateStep(5)) return;

    let finalEndedAt = endedAt;
    if (meetingActive) {
      finalEndedAt = toDatetimeLocalValue(new Date().toISOString());
      setMeetingActive(false);
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/mom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          startedAt: fromDatetimeLocalValue(startedAt),
          endedAt: finalEndedAt ? fromDatetimeLocalValue(finalEndedAt) : null,
          content: normalizeMomContent({ ...content, organizer: organizerName }),
          note: note.trim(),
          allAttendees: isPersonal ? false : allAttendees,
          attendeeUserIds: isPersonal || allAttendees ? [] : selectedAttendees,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create MoM");

      const tasksCreated = (data.tasksCreated as number | undefined) ?? 0;
      if (tasksCreated > 0) {
        toast.success(
          `Minutes saved and ${tasksCreated} task${tasksCreated === 1 ? "" : "s"} added to your board`
        );
      } else {
        toast.success("Minutes of meeting saved");
      }
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create MoM");
    } finally {
      setBusy(false);
    }
  };

  const normalized = normalizeMomContent(content);
  const isLastStep = step === MOM_WIZARD_STEPS.length - 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title="Minutes of meeting"
      size="lg"
      bodyClassName="!px-5 !py-3 sm:!px-6"
    >
      <MomWizardProgress step={step} onStepClick={goToStep} />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Step {step + 1} of {MOM_WIZARD_STEPS.length}
          </p>
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            {MOM_WIZARD_STEPS[step]}
          </h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <MomMeetingTimer
            active={meetingActive}
            paused={meetingPaused}
            startedAt={meetingStartedAt}
            elapsedOffset={meetingElapsedOffset}
            onStart={startMeeting}
            onPause={pauseMeeting}
            onResume={resumeMeeting}
          />
          {meetingActive && (
            <p className="text-[10px] text-[var(--muted)]">
              {meetingPaused
                ? "Timer paused. Resume when ready, or save MoM to finish."
                : "Timer runs while you fill each step. Pause anytime; save MoM to finish."}
            </p>
          )}
        </div>
      </div>

      <div className="min-h-[280px]">
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Meeting title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Start</label>
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">End</label>
              <Input
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Location</label>
              <Input
                value={content.location}
                onChange={(e) => updateContent({ location: e.target.value })}
                placeholder="Room, Zoom link, etc."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Organizer</label>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/50 px-3 py-2.5">
                <p className="text-sm font-medium text-[var(--foreground)]">{organizerName}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Set from your account</p>
              </div>
            </div>
          </div>

          {!isPersonal && otherParticipants.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-medium text-[var(--muted)]">Attendees</label>
              {isDirect ? (
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/50 px-3 py-2.5">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {otherParticipants.map((p) => p.name).join(", ")}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Included automatically for this 1:1 chat
                  </p>
                </div>
              ) : (
                <>
                  <label className="mb-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allAttendees}
                      onChange={(e) => setAllAttendees(e.target.checked)}
                      className="rounded border-[var(--card-border)]"
                    />
                    All members
                  </label>
                  {!allAttendees && (
                    <div className="flex flex-wrap gap-2">
                      {otherParticipants.map((p) => {
                        const selected = selectedAttendees.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleAttendee(p.id)}
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-colors",
                              selected
                                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "border-[var(--card-border)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                            )}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <ListField
          label="Agenda"
          values={content.agenda}
          onChange={(agenda) => updateContent({ agenda })}
          placeholder="Agenda item"
          suggestions={suggestions.agenda}
          suggestionCategory="agenda"
          onMutateSuggestion={(action, value) => mutateSuggestion("agenda", action, value)}
        />
      )}

      {step === 2 && (
        <div className="space-y-4">
          <label className="block text-xs font-medium text-[var(--muted)]">Discussion summary</label>
          <MomSuggestionChips
              suggestions={suggestions.discussionTopic}
              exclude={content.discussions.map((d) => d.topic).filter(Boolean)}
              label="Suggested topics"
              manageable
              onAddSuggestion={(value) => mutateSuggestion("discussionTopic", "add", value)}
              onHideSuggestion={(value) => mutateSuggestion("discussionTopic", "hide", value)}
              onPick={(text) => {
                const emptyIndex = content.discussions.findIndex((d) => !d.topic.trim());
                if (emptyIndex >= 0) {
                  const discussions = [...content.discussions];
                  discussions[emptyIndex] = { ...discussions[emptyIndex]!, topic: text };
                  updateContent({ discussions });
                } else {
                  updateContent({
                    discussions: [
                      ...content.discussions,
                      { id: crypto.randomUUID(), topic: text, points: [""] },
                    ],
                  });
                }
              }}
            />
          {content.discussions.map((topic, topicIndex) => (
            <div
              key={topic.id}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-hover)]/40 p-3"
            >
              <div className="mb-2 flex w-full gap-2">
                <MomSuggestionField
                  value={topic.topic}
                  onChange={(next) => {
                    const discussions = [...content.discussions];
                    discussions[topicIndex] = { ...topic, topic: next };
                    updateContent({ discussions });
                  }}
                  suggestions={suggestions.discussionTopic}
                  exclude={content.discussions
                    .map((d) => d.topic)
                    .filter((t, i) => i !== topicIndex && t.trim())}
                  placeholder="Topic"
                  className="bg-[var(--background)]"
                  manageable
                  onAddSuggestion={(value) => mutateSuggestion("discussionTopic", "add", value)}
                  onHideSuggestion={(value) =>
                    mutateSuggestion("discussionTopic", "hide", value)
                  }
                />
                {content.discussions.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateContent({
                        discussions: content.discussions.filter((_, i) => i !== topicIndex),
                      })
                    }
                    className="shrink-0 rounded p-2 text-[var(--muted)] hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="space-y-2 pl-1">
                {topic.points.map((point, pointIndex) => (
                  <div key={`${topic.id}-p-${pointIndex}`} className="flex w-full gap-2">
                    <span className="mt-2.5 shrink-0 text-[var(--muted)]">•</span>
                    <MomSuggestionField
                      multiline
                      rows={2}
                      value={point}
                      onChange={(next) => {
                        const discussions = [...content.discussions];
                        const points = [...topic.points];
                        points[pointIndex] = next;
                        discussions[topicIndex] = { ...topic, points };
                        updateContent({ discussions });
                      }}
                      suggestions={suggestions.discussionPoint}
                      exclude={topic.points.filter((_, i) => i !== pointIndex && topic.points[i]!.trim())}
                      className="min-h-0 bg-[var(--background)]"
                      placeholder="Discussion point"
                      manageable
                      onAddSuggestion={(value) => mutateSuggestion("discussionPoint", "add", value)}
                      onHideSuggestion={(value) =>
                        mutateSuggestion("discussionPoint", "hide", value)
                      }
                    />
                    {topic.points.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const discussions = [...content.discussions];
                          discussions[topicIndex] = {
                            ...topic,
                            points: topic.points.filter((_, i) => i !== pointIndex),
                          };
                          updateContent({ discussions });
                        }}
                        className="mt-1 shrink-0 rounded p-1 text-[var(--muted)] hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!lastStringFilled(topic.points)}
                  onClick={() => {
                    const discussions = [...content.discussions];
                    discussions[topicIndex] = { ...topic, points: [...topic.points, ""] };
                    updateContent({ discussions });
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add point
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={
              content.discussions.length > 0 &&
              (() => {
                const last = content.discussions[content.discussions.length - 1]!;
                return !last.topic.trim() || !lastStringFilled(last.points);
              })()
            }
            onClick={() =>
              updateContent({
                discussions: [
                  ...content.discussions,
                  { id: crypto.randomUUID(), topic: "", points: [""] },
                ],
              })
            }
          >
            <Plus className="h-4 w-4" />
            Add topic
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <ListField
            label="Decisions taken"
            description="Record key decisions made during the meeting"
            values={content.decisions}
            onChange={(decisions) => updateContent({ decisions })}
            placeholder="What was decided?"
            suggestions={suggestions.decision}
            suggestionCategory="decision"
            onMutateSuggestion={(action, value) => mutateSuggestion("decision", action, value)}
          />
          <section className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-hover)]/20 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Action items</h3>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Assign tasks with owner, due date, and priority
              </p>
            </div>
            <div className="space-y-3">
              {content.actionItems.map((item, index) => (
                <ActionItemRow
                  key={item.id}
                  index={index}
                  item={item}
                  conversationId={conversation.id}
                  workspaceId={effectiveWorkspaceId}
                  taskSuggestions={suggestions.actionTask}
                  onMutateTaskSuggestion={(action, value) =>
                    mutateSuggestion("actionTask", action, value)
                  }
                  linkedTaskIds={content.actionItems
                    .map((a) => a.taskId)
                    .filter((id): id is string => Boolean(id))}
                  excludePreviousKeys={content.actionItems
                    .filter((_, i) => i !== index && content.actionItems[i]!.task.trim())
                    .map((a) => previousActionKey(a))}
                  ownerReadOnly={!canPickActionOwner}
                  defaultOwner={defaultActionOwner}
                  ownerOptions={actionOwnerOptions}
                  onChange={(next) => {
                    const actionItems = [...content.actionItems];
                    actionItems[index] = canPickActionOwner
                      ? next
                      : { ...next, owner: defaultActionOwner };
                    updateContent({ actionItems });
                  }}
                  onRemove={
                    content.actionItems.length > 1
                      ? () =>
                          updateContent({
                            actionItems: content.actionItems.filter((_, i) => i !== index),
                          })
                      : undefined
                  }
                />
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  content.actionItems.length > 0 &&
                  !content.actionItems[content.actionItems.length - 1]!.task.trim()
                }
                onClick={() =>
                  updateContent({
                    actionItems: [
                      ...content.actionItems,
                      makeActionItem(canPickActionOwner ? "" : defaultActionOwner),
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Add action
              </Button>
            </div>
          </section>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <ListField
            label="Risks / blockers"
            values={content.risks}
            onChange={(risks) => updateContent({ risks })}
            placeholder="Risk or blocker"
            suggestions={suggestions.risk}
            suggestionCategory="risk"
            onMutateSuggestion={(action, value) => mutateSuggestion("risk", action, value)}
          />
          <ListField
            label="Pending items"
            values={content.pendingItems}
            onChange={(pendingItems) => updateContent({ pendingItems })}
            placeholder="Pending item"
            suggestions={suggestions.pendingItem}
            suggestionCategory="pendingItem"
            onMutateSuggestion={(action, value) => mutateSuggestion("pendingItem", action, value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Next meeting date</label>
              <Input
                type="date"
                value={toDateInputValue(content.nextMeetingDate)}
                onChange={(e) =>
                  updateContent({ nextMeetingDate: fromDateInputValue(e.target.value) })
                }
              />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Next meeting agenda</label>
              <MomSuggestionField
                value={content.nextMeetingAgenda}
                onChange={(next) => updateContent({ nextMeetingAgenda: next })}
                suggestions={suggestions.nextMeetingAgenda}
                placeholder="Brief agenda for next meeting"
                className="bg-[var(--background)]"
                manageable
                onAddSuggestion={(value) => mutateSuggestion("nextMeetingAgenda", "add", value)}
                onHideSuggestion={(value) => mutateSuggestion("nextMeetingAgenda", "hide", value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Note in chat (optional)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Short message above the MoM card"
              rows={2}
            />
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-hover)]/30 p-4">
            <h3 className="font-semibold text-[var(--foreground)]">{title}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {formatMomTimeRange(fromDatetimeLocalValue(startedAt), endedAt ? fromDatetimeLocalValue(endedAt) : null)}
            </p>
            {content.location && (
              <p className="mt-2 text-xs text-[var(--muted)]">Location: {content.location}</p>
            )}
            {content.organizer && (
              <p className="text-xs text-[var(--muted)]">Organizer: {content.organizer}</p>
            )}
          </div>
          {normalized.agenda.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Agenda</h4>
              <ul className="list-decimal space-y-0.5 pl-5 text-[var(--foreground)]">
                {normalized.agenda.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}
          {normalized.discussions.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Discussion
              </h4>
              {normalized.discussions.map((d) => (
                <div key={d.id} className="mb-2">
                  {d.topic && <p className="font-medium">{d.topic}</p>}
                  <ul className="list-disc pl-5 text-[var(--foreground)]">
                    {d.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          {normalized.actionItems.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Action items ({normalized.actionItems.length})
              </h4>
              <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="bg-[var(--surface-hover)] text-[var(--muted)]">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Task</th>
                      <th className="px-2 py-1.5 font-medium">Owner</th>
                      <th className="px-2 py-1.5 font-medium">Due</th>
                      <th className="px-2 py-1.5 font-medium">Priority</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium">Linked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalized.actionItems.map((item) => (
                      <tr key={item.id} className="border-t border-[var(--card-border)]">
                        <td className="px-2 py-1.5">{item.task}</td>
                        <td className="px-2 py-1.5">{item.owner || "—"}</td>
                        <td className="px-2 py-1.5">
                          {item.dueDate ? formatMomDueDate(item.dueDate) : "—"}
                        </td>
                        <td className="px-2 py-1.5 capitalize">{item.priority}</td>
                        <td className="px-2 py-1.5 capitalize">{item.status.replace("_", " ")}</td>
                        <td className="px-2 py-1.5">
                          {item.taskId ? (
                            <span className="font-medium text-[var(--accent)]">Linked</span>
                          ) : item.createTask !== false ? (
                            <span className="text-[var(--muted)]">Will create</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      </div>

      <div className="mt-6 flex justify-between gap-2 border-t border-[var(--card-border)] pt-4">
        <Button type="button" variant="secondary" onClick={step === 0 ? requestClose : goBack}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        <div className="flex gap-2">
          {!isLastStep ? (
            <Button type="button" onClick={goNext}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={() => void submit()} isLoading={busy}>
              Save MoM
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

type ActionSourceMode = "link" | "new" | "previous";

function inferActionSourceMode(item: MomActionItem): ActionSourceMode | null {
  if (item.taskId) return "link";
  if (item.task.trim()) return "new";
  return null;
}

const SOURCE_LABELS: Record<ActionSourceMode, string> = {
  link: "Linked task",
  new: "New task",
  previous: "From previous MoM",
};

function ActionSourceChooser({
  onSelect,
}: {
  onSelect: (mode: ActionSourceMode) => void;
}) {
  const options: {
    mode: ActionSourceMode;
    icon: typeof Link2;
    title: string;
    description: string;
  }[] = [
    {
      mode: "link",
      icon: Link2,
      title: "Link existing",
      description: "Pick a task from your board",
    },
    {
      mode: "new",
      icon: Plus,
      title: "New task",
      description: "Add to dashboard & board",
    },
    {
      mode: "previous",
      icon: History,
      title: "Previous MoM",
      description: "Carry forward from last meetings",
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map(({ mode, icon: Icon, title, description }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onSelect(mode)}
          className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-hover)]/40 px-3 py-3 text-left transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5"
        >
          <Icon className="mb-2 h-4 w-4 text-[var(--accent)]" />
          <p className="text-xs font-semibold text-[var(--foreground)]">{title}</p>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">{description}</p>
        </button>
      ))}
    </div>
  );
}

function ActionItemRow({
  index,
  item,
  onChange,
  onRemove,
  conversationId,
  workspaceId = null,
  linkedTaskIds = [],
  excludePreviousKeys = [],
  taskSuggestions = [],
  onMutateTaskSuggestion,
  ownerReadOnly = false,
  defaultOwner = "",
  ownerOptions = [],
}: {
  index: number;
  item: MomActionItem;
  onChange: (item: MomActionItem) => void;
  onRemove?: () => void;
  conversationId: string;
  workspaceId?: string | null;
  linkedTaskIds?: string[];
  excludePreviousKeys?: string[];
  taskSuggestions?: string[];
  onMutateTaskSuggestion?: (action: "add" | "hide", value: string) => void | Promise<void>;
  ownerReadOnly?: boolean;
  defaultOwner?: string;
  ownerOptions?: { id: string; name: string }[];
}) {
  const fieldClass =
    "w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60";

  const [sourceMode, setSourceMode] = useState<ActionSourceMode | null>(() =>
    inferActionSourceMode(item)
  );

  useEffect(() => {
    const inferred = inferActionSourceMode(item);
    if (inferred) setSourceMode(inferred);
  }, [item.taskId, item.task]);

  const isLinked = Boolean(item.taskId);
  const fieldsDisabled = isLinked;
  const hasContent = Boolean(item.taskId || item.task.trim());
  const showDetails =
    sourceMode === "new" ||
    (hasContent && (sourceMode === "link" || sourceMode === "previous"));

  const resetSource = () => {
    setSourceMode(null);
    onChange({
      ...item,
      task: "",
      taskId: null,
      dueDate: "",
      priority: "medium",
      status: "pending",
      createTask: true,
      owner: defaultOwner || item.owner,
    });
  };

  const linkTask = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load task");
    const task = data.task as {
      id: string;
      title: string;
      priority: "LOW" | "MEDIUM" | "HIGH";
      status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
      dueDate: string | null;
      assignees?: { user: { id: string; name: string }; isPrimary: boolean }[];
    };
    setSourceMode("link");
    onChange(
      linkedTaskToActionItemFields(
        {
          id: task.id,
          title: task.title,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
          assignees: task.assignees,
        },
        item,
        ownerOptions
      )
    );
  };

  const applyPreviousAction = (next: MomActionItem) => {
    setSourceMode("previous");
    onChange({ ...next, id: item.id });
  };

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--muted)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)]">
            {index + 1}
          </span>
          Action item
          {sourceMode && hasContent && (
            <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--foreground)]">
              {SOURCE_LABELS[sourceMode]}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {hasContent && (
            <button
              type="button"
              onClick={resetSource}
              className="rounded-lg px-2 py-1 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            >
              Change source
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-red-500"
              aria-label="Remove action item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {!sourceMode && !hasContent && (
          <ActionSourceChooser onSelect={setSourceMode} />
        )}

        {sourceMode === "new" && !hasContent && (
          <button
            type="button"
            onClick={resetSource}
            className="text-[10px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ← Choose another source
          </button>
        )}

        {sourceMode === "link" && !hasContent && (
          <>
            <button
              type="button"
              onClick={resetSource}
              className="text-[10px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              ← Choose another source
            </button>
            <MomActionTaskPicker
              workspaceId={workspaceId}
              excludeTaskIds={linkedTaskIds}
              defaultOpen
              onSelect={linkTask}
            />
          </>
        )}

        {sourceMode === "previous" && !hasContent && (
          <>
            <button
              type="button"
              onClick={resetSource}
              className="text-[10px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              ← Choose another source
            </button>
            <MomPreviousActionPicker
              conversationId={conversationId}
              excludeKeys={excludePreviousKeys}
              ownerOptions={ownerOptions}
              onSelect={applyPreviousAction}
            />
          </>
        )}

        {isLinked && hasContent && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]">
              {item.task}
            </p>
            <button
              type="button"
              onClick={resetSource}
              className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Unlink
            </button>
          </div>
        )}

        {showDetails && (
          <>
            {sourceMode === "new" && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/30 px-3 py-2 text-xs text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={item.createTask !== false}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      createTask: e.target.checked,
                      taskId: null,
                    })
                  }
                  className="h-3.5 w-3.5 rounded border-[var(--card-border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                <span>Add to tasks (dashboard & board)</span>
              </label>
            )}

            {!isLinked && (
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Task
                </label>
                <MomSuggestionField
                  value={item.task}
                  onChange={(task) => onChange({ ...item, task })}
                  suggestions={taskSuggestions}
                  placeholder="What needs to be done?"
                  className="bg-[var(--background)]"
                  disabled={fieldsDisabled}
                  manageable={Boolean(onMutateTaskSuggestion)}
                  onAddSuggestion={
                    onMutateTaskSuggestion
                      ? (value) => onMutateTaskSuggestion("add", value)
                      : undefined
                  }
                  onHideSuggestion={
                    onMutateTaskSuggestion
                      ? (value) => onMutateTaskSuggestion("hide", value)
                      : undefined
                  }
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Owner
                </label>
                {ownerReadOnly || fieldsDisabled ? (
                  <div className="rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/50 px-3 py-2.5">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {fieldsDisabled ? item.owner || "—" : defaultOwner || item.owner || "—"}
                    </p>
                    {ownerReadOnly && !fieldsDisabled && (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">Default for this chat</p>
                    )}
                    {fieldsDisabled && (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">Synced from linked task</p>
                    )}
                  </div>
                ) : (
                  <select
                    value={item.owner}
                    onChange={(e) => onChange({ ...item, owner: e.target.value })}
                    className={fieldClass}
                  >
                    <option value="">Select owner</option>
                    {ownerOptions.map((member) => (
                      <option key={member.id} value={member.name}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Due date
                </label>
                <Input
                  type="date"
                  value={item.dueDate ? toDateInputValue(item.dueDate) : ""}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      dueDate: e.target.value ? fromDateInputValue(e.target.value) : "",
                    })
                  }
                  className="bg-[var(--background)]"
                  disabled={fieldsDisabled}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Priority
                </label>
                <select
                  value={item.priority}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      priority: e.target.value as MomActionItem["priority"],
                    })
                  }
                  className={fieldClass}
                  disabled={fieldsDisabled}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Status
                </label>
                <select
                  value={item.status}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      status: e.target.value as MomActionItem["status"],
                    })
                  }
                  className={fieldClass}
                  disabled={fieldsDisabled}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
