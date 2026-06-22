import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Messages",
  "Direct messages, group chats, and team channels."
);

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative -mx-3 -my-4 min-h-0 flex-1 sm:-mx-5 sm:-my-5 lg:-mx-6 lg:-my-6">
      <div className="messages-full-bleed absolute inset-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
