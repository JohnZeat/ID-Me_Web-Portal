"use client";

import { useEffect, useRef, useState } from "react";
import { listAuditLog, type AuditLogEntry } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";

const PAGE_SIZE = 20;

function formatDetails(action: string, details: Record<string, unknown>): string {
  const s = (key: string) => (typeof details[key] === "string" ? (details[key] as string) : "");
  const n = (key: string) => (typeof details[key] === "number" ? (details[key] as number) : 0);

  switch (action) {
    case "STAFF_INVITED":
      return `Invited ${s("email")} (${s("fullName")}) as ${s("role")}`;
    case "STAFF_REMOVED":
      return `Removed ${s("email")} (${s("role")})`;
    case "STAFF_CSV_UPLOADED":
      return `Bulk staff upload: ${n("invited")} invited, ${n("skippedCount")} skipped`;
    case "CUSTOMERS_CSV_UPLOADED":
      return `Customer CSV upload: ${n("upserted")} upserted, ${n("skippedCount")} skipped`;
    case "COMPANY_SETTINGS_UPDATED":
      return `Updated settings — name: ${s("name")}, code expiry: ${n(
        "codeExpirySeconds"
      )}s, date format: ${s("dateFormat")}`;
    case "DOMAIN_ADDED":
      return `Added domain ${s("domain")}`;
    case "DOMAIN_REMOVED":
      return `Removed domain ${s("domain")}`;
    case "API_KEY_CREATED":
      return `Created API key "${s("name")}" (${s("keyPrefix")}...)`;
    case "API_KEY_REVOKED":
      return `Revoked API key "${s("name")}"`;
    default:
      return JSON.stringify(details);
  }
}

const ACTION_LABELS: Record<string, string> = {
  STAFF_INVITED: "Staff invited",
  STAFF_REMOVED: "Staff removed",
  STAFF_CSV_UPLOADED: "Staff bulk upload",
  CUSTOMERS_CSV_UPLOADED: "Customer upload",
  COMPANY_SETTINGS_UPDATED: "Settings updated",
  DOMAIN_ADDED: "Domain added",
  DOMAIN_REMOVED: "Domain removed",
  API_KEY_CREATED: "API key created",
  API_KEY_REVOKED: "API key revoked",
};

export function AuditLogTable() {
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    listAuditLog({ page, pageSize: PAGE_SIZE }).then((result) => {
      if (id !== requestId.current) return;
      if (result.ok) {
        setEntries(result.data.entries);
        setTotal(result.data.total);
        setError(null);
      } else {
        setError({ code: result.code, message: result.message });
      }
      setLoaded(true);
    });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">Audit log</p>
      <p className="text-xs text-gray-500">
        Administrative actions taken in this admin area — staff, settings,
        domains, and API keys. Code generation/verification isn&apos;t
        included here yet.
      </p>

      {error && <ErrorGuidance code={error.code} fallback={error.message} />}

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Details</th>
              <th className="px-4 py-2 font-medium">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loaded && entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-gray-500">
                  No audit events yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-900">
                  {ACTION_LABELS[e.action] ?? e.action}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {formatDetails(e.action, e.details)}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                  {e.actorEmail ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {total === 0
            ? "0 results"
            : `Page ${page} of ${totalPages} (${total} total)`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
