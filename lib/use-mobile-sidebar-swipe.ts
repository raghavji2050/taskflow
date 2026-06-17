"use client";

import { useEffect, useRef } from "react";

const MOBILE_MEDIA = "(max-width: 1023px)";
export const EDGE_ZONE_PX = 24;
export const SWIPE_THRESHOLD_PX = 60;
export const MAX_VERTICAL_DRIFT_PX = 40;
export const MOBILE_SIDEBAR_DRAWER_ID = "mobile-sidebar-drawer";
export const MOBILE_SIDEBAR_OVERLAY_ID = "mobile-sidebar-overlay";

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MEDIA).matches;
}

function hasBlockingModal() {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
}

type GestureMode = "open" | "close";

interface UseMobileSidebarSwipeOptions {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function useMobileSidebarSwipe({ isOpen, onOpen, onClose }: UseMobileSidebarSwipeOptions) {
  const isOpenRef = useRef(isOpen);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const trackingRef = useRef<{
    mode: GestureMode;
    startX: number;
    startY: number;
  } | null>(null);

  isOpenRef.current = isOpen;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    const resetTracking = () => {
      trackingRef.current = null;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!isMobileViewport()) return;
      if (hasBlockingModal()) return;

      const touch = e.touches[0];
      if (!touch) return;

      if (isOpenRef.current) {
        const overlay = document.getElementById(MOBILE_SIDEBAR_OVERLAY_ID);
        const target = e.target as Node;
        if (!overlay?.contains(target)) return;

        trackingRef.current = {
          mode: "close",
          startX: touch.clientX,
          startY: touch.clientY,
        };
        return;
      }

      if (touch.clientX > EDGE_ZONE_PX) return;

      trackingRef.current = {
        mode: "open",
        startX: touch.clientX,
        startY: touch.clientY,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const tracking = trackingRef.current;
      if (!tracking) return;

      const touch = e.touches[0];
      if (!touch) return;

      const dx = touch.clientX - tracking.startX;
      const dy = touch.clientY - tracking.startY;

      if (Math.abs(dy) > MAX_VERTICAL_DRIFT_PX && Math.abs(dy) > Math.abs(dx)) {
        resetTracking();
        return;
      }

      if (tracking.mode === "open" && dx >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
        onOpenRef.current();
        resetTracking();
        return;
      }

      if (tracking.mode === "close" && dx <= -SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
        onCloseRef.current();
        resetTracking();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", resetTracking, { passive: true });
    document.addEventListener("touchcancel", resetTracking, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", resetTracking);
      document.removeEventListener("touchcancel", resetTracking);
    };
  }, []);
}
