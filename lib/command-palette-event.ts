"use client";

export const OPEN_PALETTE_EVENT = "taskflow:open-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}
