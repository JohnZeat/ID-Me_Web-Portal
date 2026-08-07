"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSubscription, resumeSubscription, type SubscriptionSummary } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";
import { SubscribeToProPanel } from "./subscribe-to-pro-panel";
import { BillingPortalButton } from "./billing-portal-button";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
};

export function SubscriptionPanel({ summary }: { summary: SubscriptionSummary }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function handleCancel() {
    setError(null);
    setBusy(true);
    const result = await cancelSubscription();
    if (!result.ok) setError({ code: result.code, message: result.message });
    setConfirming(false);
    setBusy(false);
    router.refresh();
  }

  async function handleResume() {
    setError(null);
    setBusy(true);
    const result = await resumeSubscription();
    if (!result.ok) setError({ code: result.code, message: result.message });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-700">Current plan</p>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500">Plan</dt>
            <dd className="text-gray-900">{summary.planName}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Status</dt>
            <dd className="text-gray-900">
              {STATUS_LABEL[summary.status] ?? summary.status}
              {summary.status === "trialing" && summary.trialDaysLeft !== null && (
                <span className="ml-1 text-xs text-gray-400">
                  ({summary.trialDaysLeft} day{summary.trialDaysLeft === 1 ? "" : "s"} left)
                </span>
              )}
              {summary.cancelAtPeriodEnd && (
                <span className="ml-1 text-xs text-amber-600">(cancels at period end)</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Seats in use</dt>
            <dd className="text-gray-900">{summary.seatsInUse}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Current rate</dt>
            <dd className="text-gray-900">
              {summary.pricePerSeatCents !== null
                ? `${formatCents(summary.pricePerSeatCents)}/seat`
                : "—"}
            </dd>
          </div>
          {summary.estimatedMonthlyCents !== null && (
            <div>
              <dt className="text-xs text-gray-500">Estimated monthly total</dt>
              <dd className="text-gray-900">{formatCents(summary.estimatedMonthlyCents)}</dd>
            </div>
          )}
        </dl>

        {summary.tiers.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-medium text-gray-500">Pricing tiers</p>
            <ul className="space-y-1 text-xs text-gray-500">
              {summary.tiers.map((t) => (
                <li key={t.minSeats}>
                  {t.minSeats}
                  {t.maxSeats ? `–${t.maxSeats}` : "+"} seats — {formatCents(t.pricePerSeatCents)}
                  /seat
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
          Seats scale automatically with your staff count — invite or offboard staff from the
          Staff tab to add or remove seats.
        </p>
      </div>

      {!summary.hasStripeSubscription && <SubscribeToProPanel />}

      {summary.hasStripeSubscription && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-700">Cancel subscription</p>
          {summary.cancelAtPeriodEnd ? (
            <>
              <p className="text-xs text-gray-500">
                Your subscription is set to cancel at the end of the current billing period.
              </p>
              <button
                onClick={handleResume}
                disabled={busy}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? "Resuming..." : "Resume subscription"}
              </button>
            </>
          ) : confirming ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                You&apos;ll keep access until the end of the current billing period, then your
                account will lose access to the admin and staff areas. Are you sure?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  disabled={busy}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Cancelling..." : "Confirm cancel"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Keep subscription
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Cancels at the end of your current billing period — you keep access until then.
              </p>
              <button
                onClick={() => setConfirming(true)}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cancel subscription
              </button>
            </>
          )}
        </div>
      )}

      {error && <ErrorGuidance code={error.code} fallback={error.message} />}

      {summary.hasStripeSubscription && <BillingPortalButton />}
    </div>
  );
}
