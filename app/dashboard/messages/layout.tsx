import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";
import { MessagesViewportShell } from "@/components/chat/MessagesViewportShell";

export const metadata: Metadata = appPageMetadata(
  "Messages",
  "Direct messages, group chats, and team channels."
);

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative -mx-3 -my-4 flex min-h-0 w-full min-w-0 flex-1 sm:-mx-5 sm:-my-5 lg:-mx-6 lg:-my-6">
      <MessagesViewportShell>{children}</MessagesViewportShell>
    </div>
  );
}
