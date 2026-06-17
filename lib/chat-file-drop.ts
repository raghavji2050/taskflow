import { useCallback, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
} from "@/lib/attachments";

export function chatFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function mergeChatUploadFiles(existing: File[], incoming: File[]) {
  const map = new Map<string, File>();
  for (const f of existing) map.set(chatFileKey(f), f);

  const rejected: string[] = [];
  for (const f of incoming) {
    if (f.size > MAX_CHAT_ATTACHMENT_BYTES) {
      rejected.push(`${f.name} (too large)`);
      continue;
    }
    map.set(chatFileKey(f), f);
  }

  let merged = [...map.values()];
  if (merged.length > MAX_CHAT_ATTACHMENTS_PER_MESSAGE) {
    toast.error(`Maximum ${MAX_CHAT_ATTACHMENTS_PER_MESSAGE} files per message`);
    merged = merged.slice(0, MAX_CHAT_ATTACHMENTS_PER_MESSAGE);
  }
  if (rejected.length > 0) {
    toast.error(`Skipped: ${rejected.join(", ")}`);
  }

  return merged;
}

export function filesFromDataTransfer(dataTransfer: DataTransfer) {
  return [...dataTransfer.files];
}

export function hasFileDrag(dataTransfer: DataTransfer) {
  return [...dataTransfer.types].includes("Files");
}

export function useFileDragDrop({
  disabled,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || !hasFileDrag(e.dataTransfer)) return;
      dragDepthRef.current += 1;
      setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      if (hasFileDrag(e.dataTransfer)) {
        e.dataTransfer.dropEffect = "copy";
      }
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);
      if (disabled) return;
      const files = filesFromDataTransfer(e.dataTransfer);
      if (files.length > 0) onFiles(files);
    },
    [disabled, onFiles]
  );

  return {
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
