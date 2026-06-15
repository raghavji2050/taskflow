"use client";

import { Suspense } from "react";
import { MessagesClient } from "@/components/chat/MessagesClient";

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesClient />
    </Suspense>
  );
}
