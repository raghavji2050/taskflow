"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

export default function DocsPage() {
  const [spec, setSpec] = useState<object | null>(null);

  useEffect(() => {
    fetch("/api/openapi").then((r) => r.json()).then(setSpec);
  }, []);

  if (!spec) return <div className="p-8 text-center">Loading API docs...</div>;

  const paths = (spec as { paths: Record<string, Record<string, { summary: string; tags?: string[] }>> }).paths;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">API Documentation</h1>
      <p className="mb-6 text-sm text-zinc-500">
        OpenAPI spec available at <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/api/openapi</code>
      </p>
      <div className="space-y-3">
        {Object.entries(paths).map(([path, methods]) => (
          <Card key={path} className="p-4">
            <code className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{path}</code>
            <div className="mt-2 space-y-1">
              {Object.entries(methods).map(([method, info]) => (
                <div key={method} className="flex items-center gap-2 text-sm">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-bold uppercase dark:bg-zinc-800">{method}</span>
                  <span>{info.summary}</span>
                  {info.tags && <span className="text-xs text-zinc-400">{info.tags.join(", ")}</span>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
