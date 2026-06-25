"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type MobileSidebarContextValue = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const MobileSidebarContext = createContext<MobileSidebarContextValue | null>(null);

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const value = useMemo(
    () => ({ mobileOpen, setMobileOpen }),
    [mobileOpen]
  );

  return (
    <MobileSidebarContext.Provider value={value}>{children}</MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar() {
  const ctx = useContext(MobileSidebarContext);
  if (!ctx) {
    throw new Error("useMobileSidebar must be used within MobileSidebarProvider");
  }
  return ctx;
}

/** Safe when provider is absent (e.g. tests). */
export function useMobileSidebarOptional() {
  return useContext(MobileSidebarContext);
}
