"use client";

import { useEffect, useState } from "react";
import { resolveErrorGuidance } from "@/app/actions";

// Renders staff-facing errors via the error_messages matrix: looks up
// guidance HTML for `code` (company override, else Global default) and
// falls back to plain-text `fallback` if no matrix entry exists yet.
export function ErrorGuidance({ code, fallback }: { code: string; fallback: string }) {
  const [guidance, setGuidance] = useState<{ title: string; html: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveErrorGuidance(code).then((g) => {
      if (!cancelled) setGuidance(g);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {guidance ? (
        <div dangerouslySetInnerHTML={{ __html: guidance.html }} />
      ) : (
        <p>{fallback}</p>
      )}
    </div>
  );
}
