"use client";

import { useState } from "react";
import { startProSubscription } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";

export function SubscribeToProPanel() {
  const [seats, setSeats] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await startProSubscription(Number(seats));
    if (result.ok) {
      window.location.href = result.data.checkoutUrl;
    } else {
      setError({ code: result.code, message: result.message });
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-gray-200 bg-white p-4"
    >
      <p className="text-sm font-medium text-gray-700">Subscribe to Pro</p>
      <p className="text-xs text-gray-500">
        $18/seat (up to 20), $15/seat (21-100), $13.50/seat (100+) — billed
        monthly, based on your total staff count.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Seats
          </label>
          <input
            type="number"
            required
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {submitting ? "Redirecting to checkout..." : "Subscribe to Pro"}
        </button>
      </div>
      {error && <ErrorGuidance code={error.code} fallback={error.message} />}
    </form>
  );
}
