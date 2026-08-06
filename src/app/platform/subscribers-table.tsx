"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { suspendCompany, reactivateCompany, type SubscriberEntry } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";

export function SubscribersTable({ subscribers }: { subscribers: SubscriberEntry[] }) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function handleSuspend(id: string) {
    setError(null);
    setBusyId(id);
    const result = await suspendCompany(id);
    if (!result.ok) setError({ code: result.code, message: result.message });
    setConfirmingId(null);
    setBusyId(null);
    router.refresh();
  }

  async function handleReactivate(id: string) {
    setError(null);
    setBusyId(id);
    const result = await reactivateCompany(id);
    if (!result.ok) setError({ code: result.code, message: result.message });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Seats</th>
              <th className="px-4 py-2 font-medium">Signed up</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {subscribers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-center text-gray-500">
                  No subscribers yet.
                </td>
              </tr>
            )}
            {subscribers.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 text-gray-900">{s.name}</td>
                <td className="px-4 py-2 text-gray-600">{s.planName ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600">
                  {s.suspendedAt ? (
                    <span className="text-red-600">suspended</span>
                  ) : (
                    s.subscriptionStatus
                  )}
                  {s.subscriptionStatus === "trialing" && s.trialEndsAt && !s.suspendedAt && (
                    <span className="ml-1 text-xs text-gray-400">
                      (ends {new Date(s.trialEndsAt).toLocaleDateString()})
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">{s.staffCount}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  {s.suspendedAt ? (
                    <button
                      onClick={() => handleReactivate(s.id)}
                      disabled={busyId === s.id}
                      className="text-xs font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
                    >
                      {busyId === s.id ? "Reactivating..." : "Reactivate"}
                    </button>
                  ) : confirmingId === s.id ? (
                    <span className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleSuspend(s.id)}
                        disabled={busyId === s.id}
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {busyId === s.id ? "Suspending..." : "Confirm suspend"}
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
                      onClick={() => setConfirmingId(s.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <ErrorGuidance code={error.code} fallback={error.message} />}
    </div>
  );
}
