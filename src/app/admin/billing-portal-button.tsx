"use client";

import { useState } from "react";
import { openBillingPortal } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";

export function BillingPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    const result = await openBillingPortal();
    if (result.ok) {
      window.location.href = result.data.portalUrl;
    } else {
      setError({ code: result.code, message: result.message });
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-700">Billing</p>
      <p className="text-xs text-gray-500">
        View invoices, update your payment method, or manage your
        subscription via Stripe.
      </p>
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? "Redirecting..." : "Manage billing"}
      </button>
      {error && <ErrorGuidance code={error.code} fallback={error.message} />}
    </div>
  );
}
