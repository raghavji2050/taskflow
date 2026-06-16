"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocumentType } from "@prisma/client";
import { DocumentTypeBadge } from "@/components/docs/DocumentTypeBadge";
import { DOCUMENT_TYPE_ICONS } from "@/lib/document-ui";
import {
  LinkPickerEmpty,
  LinkPickerHint,
  LinkPickerList,
  LinkPickerLoading,
  LinkPickerRow,
  LinkPickerScroll,
  LinkSearchInput,
} from "@/components/docs/link-picker-ui";

interface DocOption {
  id: string;
  title: string;
  type: DocumentType;
  icon: string | null;
}

interface LinkDocumentPickerProps {
  workspaceId?: string | null;
  linkedDocIds?: string[];
  onLink: (documentId: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function LinkDocumentPicker({
  workspaceId,
  linkedDocIds = [],
  onLink,
  disabled,
  placeholder = "Search documents to link…",
}: LinkDocumentPickerProps) {
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const linkedSet = new Set(linkedDocIds);

  const fetchDocs = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        archived: "false",
        flat: "true",
      });
      if (workspaceId) params.set("workspaceId", workspaceId);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/documents?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setDocs([]);
        return;
      }
      setDocs(
        (data.documents as DocOption[]).filter((d) => !linkedSet.has(d.id))
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, linkedDocIds.join(",")]);

  useEffect(() => {
    const t = setTimeout(() => void fetchDocs(query), 300);
    return () => clearTimeout(t);
  }, [query, fetchDocs]);

  const handlePick = async (documentId: string) => {
    setLinkingId(documentId);
    try {
      await onLink(documentId);
      setQuery("");
      void fetchDocs("");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-[var(--card-border)] bg-[var(--surface-hover)]/40 p-3">
      <LinkSearchInput
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        disabled={disabled}
      />
      <LinkPickerHint>Pick a document below to link it to this task</LinkPickerHint>
      <LinkPickerList>
        <LinkPickerScroll>
          {loading && <LinkPickerLoading />}
          {!loading && docs.length === 0 && (
            <LinkPickerEmpty
              message={query.trim() ? "No documents match your search" : "No documents available"}
            />
          )}
          {!loading &&
            docs.map((doc) => (
              <LinkPickerRow
                key={doc.id}
                disabled={disabled}
                linking={linkingId === doc.id}
                onClick={() => void handlePick(doc.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">
                    {doc.icon ?? DOCUMENT_TYPE_ICONS[doc.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--foreground)]">
                      {doc.title}
                    </p>
                    <DocumentTypeBadge type={doc.type} className="mt-1" />
                  </div>
                </div>
              </LinkPickerRow>
            ))}
        </LinkPickerScroll>
      </LinkPickerList>
    </div>
  );
}
