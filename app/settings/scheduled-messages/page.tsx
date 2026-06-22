import type { Metadata } from "next";
import { ScheduledMessagesPanel } from "@/components/chat/ScheduledMessagesPanel";

export const metadata: Metadata = {
  title: "Scheduled Messages",
};

export default function ScheduledMessagesSettingsPage() {
  return <ScheduledMessagesPanel />;
}
