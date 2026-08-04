"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createApiKey, revokeApiKey, type ApiKeyEntry } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";

export function ApiKeyPanel({ initialKeys }: { initialKeys: ApiKeyEntry[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNewRawKey(null);
    setCreating(true);
    const result = await createApiKey(name);
    if (result.ok) {
      setNewRawKey(result.data.rawKey);
      setName("");
      router.refresh();
    } else {
      setError({ code: result.code, message: result.message });
    }
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    setError(null);
    setRevokingId(id);
    const result = await revokeApiKey(id);
    if (!result.ok) {
      setError({ code: result.code, message: result.message });
    }
    setConfirmingId(null);
    setRevokingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-700">API keys</p>
      <p className="text-xs text-gray-500">
        For your own systems (CRM, POS) to call the customer sync and code
        generation APIs directly, instead of through this dashboard.
      </p>

      {newRawKey && (
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="mb-1 font-medium text-amber-900">
            Copy this key now — it won&apos;t be shown again.
          </p>
          <code className="block break-all rounded bg-white px-2 py-1 text-xs text-gray-900">
            {newRawKey}
          </code>
        </div>
      )}

      <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
        {initialKeys.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">No API keys yet.</li>
        )}
        {initialKeys.map((k) => (
          <li
            key={k.id}
            className="flex items-center justify-between px-4 py-2 text-sm"
          >
            <span className="text-gray-900">
              {k.name}
              <span className="ml-2 font-mono text-xs text-gray-500">
                {k.keyPrefix}...
              </span>
              {k.revokedAt && (
                <span className="ml-2 text-xs text-red-600">Revoked</span>
              )}
            </span>
            {!k.revokedAt &&
              (confirmingId === k.id ? (
                <span className="flex items-center gap-3">
                  <button
                    onClick={() => handleRevoke(k.id)}
                    disabled={revokingId === k.id}
                    className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {revokingId === k.id ? "Revoking..." : "Confirm revoke"}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmingId(k.id)}
                  className="text-xs font-medium text-red-600 hover:text-red-800"
                >
                  Revoke
                </button>
              ))}
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate} className="flex gap-3">
        <input
          type="text"
          required
          placeholder="Key name (e.g. CRM integration)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create key"}
        </button>
      </form>

      {error && <ErrorGuidance code={error.code} fallback={error.message} />}
    </div>
  );
}
