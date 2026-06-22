import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Messages",
  "Direct messages, group chats, and team channels."
);

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="messages-full-bleed -mx-3 -my-4 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden sm:-mx-5 sm:-my-5 lg:-mx-6 lg:-my-6 lg:h-[calc(100dvh)]">
      {children}
    </div>
  );
}
