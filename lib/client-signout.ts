"use client";

import { signOut } from "next-auth/react";
import { clearWorkspaceSelection } from "@/components/WorkspaceProvider";

/** Sign out so it sticks even if other requests are still in flight (see lib/signout-marker.ts). */
export async function signOutToLogin(): Promise<void> {
  clearWorkspaceSelection();
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    /* still sign out below */
  }
  await signOut({ callbackUrl: "/login" });
}
