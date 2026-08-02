"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteStaff } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";

export function InviteStaffPanel() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    const result = await inviteStaff({ email, fullName, role });
    if (result.ok) {
      setSuccess(`Invite sent to ${result.data.email}`);
      setFullName("");
      setEmail("");
      setRole("staff");
      router.refresh();
    } else {
      setError({ code: result.code, message: result.message });
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-medium text-gray-700">Invite staff</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          required
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
        />
        <input
          type="email"
          required
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "staff" | "admin")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Send invite"}
        </button>
      </div>
      {error && <ErrorGuidance code={error.code} fallback={error.message} />}
      {success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      )}
    </form>
  );
}
