"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { offboardStaff, type StaffListEntry } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";

export function StaffList({
  staffList,
  currentUserId,
}: {
  staffList: StaffListEntry[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function handleRemove(id: string) {
    setError(null);
    setRemovingId(id);
    const result = await offboardStaff(id);
    if (!result.ok) {
      setError({ code: result.code, message: result.message });
    }
    setConfirmingId(null);
    setRemovingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
        {staffList.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">No staff yet.</li>
        )}
        {staffList.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between px-4 py-2 text-sm"
          >
            <span className="text-gray-900">
              {s.fullName ?? s.email}
              {s.fullName && <span className="ml-2 text-gray-500">{s.email}</span>}
              <span className="ml-2 text-gray-400">· {s.role}</span>
            </span>

            {s.id === currentUserId ? (
              <span className="text-xs text-gray-400">You</span>
            ) : confirmingId === s.id ? (
              <span className="flex items-center gap-3">
                <button
                  onClick={() => handleRemove(s.id)}
                  disabled={removingId === s.id}
                  className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  {removingId === s.id ? "Removing..." : "Confirm remove"}
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
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <ErrorGuidance code={error.code} fallback={error.message} />}
    </div>
  );
}
