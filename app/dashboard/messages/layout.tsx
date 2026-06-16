import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Messages",
  "Direct messages, group chats, and team channels."
);

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden sm:-mx-6 lg:-mx-8">
      {children}
    </div>
  );
}
