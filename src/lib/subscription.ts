export type SubscriptionInfo = {
  subscription_status: string;
  trial_ends_at: string | null;
  suspended_at?: string | null;
};

export function isTrialExpired(company: SubscriptionInfo): boolean {
  return (
    company.subscription_status === "trialing" &&
    !!company.trial_ends_at &&
    new Date(company.trial_ends_at).getTime() < Date.now()
  );
}

// Platform-admin-imposed lock, independent of billing/trial status --
// checked separately from isTrialExpired since the two need different
// messaging (a suspended company can't just subscribe its way out,
// unlike an expired trial). Narrower parameter type than the other
// helpers here since callers sometimes only have suspended_at in hand.
export function isSuspended(company: { suspended_at?: string | null }): boolean {
  return !!company.suspended_at;
}

export function isLocked(company: SubscriptionInfo): boolean {
  return isSuspended(company) || isTrialExpired(company);
}

// Only meaningful while still trialing and not yet expired -- null
// otherwise (no countdown to show for an active/canceled subscription).
export function trialDaysRemaining(company: SubscriptionInfo): number | null {
  if (company.subscription_status !== "trialing" || !company.trial_ends_at) return null;
  const msRemaining = new Date(company.trial_ends_at).getTime() - Date.now();
  if (msRemaining <= 0) return null;
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}
