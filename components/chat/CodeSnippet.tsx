"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlightCode, languageLabel } from "@/lib/rich-message-lowlight";
import { cn } from "@/lib/utils";

interface CodeSnippetProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  copyable?: boolean;
  collapseAfterLines?: number;
  className?: string;
  inOwnBubble?: boolean;
}

export function CodeSnippet({
  code,
  language = "plaintext",
  showLineNumbers = true,
  copyable = true,
  collapseAfterLines = 40,
  className,
  inOwnBubble = false,
}: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lines = useMemo(() => code.replace(/\n$/, "").split("\n"), [code]);
  const shouldCollapse = lines.length > collapseAfterLines;
  const visibleLines =
    shouldCollapse && !expanded ? lines.slice(0, collapseAfterLines) : lines;
  const displayCode = visibleLines.join("\n");

  const highlighted = useMemo(
    () => highlightCode(displayCode, language),
    [displayCode, language]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [code]);

  return (
    <div
      className={cn(
        "my-1.5 overflow-hidden rounded-md border text-[13px]",
        inOwnBubble
          ? "border-white/20 bg-black/25 text-white"
          : "border-[var(--border)] bg-[var(--surface-3)]",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-2.5 py-1",
          inOwnBubble ? "border-b border-white/15" : "border-b border-[var(--border)]"
        )}
      >
        <span
          className={cn(
            "text-[10px] font-medium uppercase tracking-wide",
            inOwnBubble ? "text-white/70" : "text-[var(--muted)]"
          )}
        >
          {languageLabel(language)}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex h-7 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] md:min-h-0 md:min-w-0"
            aria-label={copied ? "Copied" : "Copy code"}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <pre className="m-0 p-0 text-xs leading-relaxed">
          <code className="block min-w-full font-mono">
            {showLineNumbers ? (
              <table className="w-full border-collapse">
                <tbody>
                  {visibleLines.map((line, i) => (
                    <tr key={i} className="align-top">
                      <td
                        className={cn(
                          "select-none border-r px-2.5 py-0 text-right tabular-nums",
                          inOwnBubble
                            ? "border-white/15 text-white/45"
                            : "border-[var(--border)] text-[var(--muted)]"
                        )}
                      >
                        {i + 1}
                      </td>
                      <td className="px-2.5 py-0 font-mono">
                        <span
                          dangerouslySetInnerHTML={{
                            __html: highlightCode(line, language) || "&nbsp;",
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span className="block px-3 py-2" dangerouslySetInnerHTML={{ __html: highlighted }} />
            )}
          </code>
        </pre>
      </div>
      {shouldCollapse && (
        <div
          className={cn(
            "border-t px-2.5 py-1",
            inOwnBubble ? "border-white/15" : "border-[var(--border)]"
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              "text-xs font-medium hover:underline",
              inOwnBubble ? "text-white/80" : "text-[var(--accent)]"
            )}
          >
            {expanded ? "Show less" : `Show more (${lines.length - collapseAfterLines} more lines)`}
          </button>
        </div>
      )}
    </div>
  );
}
