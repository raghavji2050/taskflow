"use client";

import { useEffect, useState, type CSSProperties } from "react";

export type VisualViewportRect = {
  height: number;
  offsetTop: number;
  offsetLeft: number;
  width: number;
};

/** Mobile app bar (sidebar header) height — matches Tailwind `h-14`. */
export const MOBILE_APP_BAR_HEIGHT = 56;

function readVisualViewport(): VisualViewportRect {
  if (typeof window === "undefined") {
    return { height: 0, offsetTop: 0, offsetLeft: 0, width: 0 };
  }

  const vv = window.visualViewport;
  if (!vv) {
    return {
      height: window.innerHeight,
      offsetTop: 0,
      offsetLeft: 0,
      width: window.innerWidth,
    };
  }

  return {
    height: vv.height,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
    width: vv.width,
  };
}

/** Tracks the visible viewport — shrinks when the on-screen keyboard opens on mobile. */
export function useVisualViewport(): VisualViewportRect {
  const [rect, setRect] = useState<VisualViewportRect>(readVisualViewport);

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setRect(readVisualViewport());

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return rect;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function mobileFixedPanelStyle(
  vv: VisualViewportRect,
  topOffset = MOBILE_APP_BAR_HEIGHT
): CSSProperties {
  return {
    position: "fixed",
    top: vv.offsetTop + topOffset,
    left: 0,
    right: 0,
    width: "100%",
    maxWidth: "100vw",
    height: Math.max(120, vv.height - topOffset),
    zIndex: 30,
    overflow: "hidden",
    boxSizing: "border-box",
  };
}

export function mobileOverlayStyle(vv: VisualViewportRect): CSSProperties {
  return {
    position: "fixed",
    top: vv.offsetTop,
    left: vv.offsetLeft,
    width: vv.width,
    height: vv.height,
  };
}

export function mobileModalMaxHeight(vv: VisualViewportRect, reserve = 12): number {
  return Math.max(200, vv.height - reserve);
}
