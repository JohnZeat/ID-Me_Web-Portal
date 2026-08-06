export type SubscriptionInfo = {
  subscription_status: string;
  trial_ends_at: string | null;
};

export function isTrialExpired(company: SubscriptionInfo): boolean {
  return (
    company.subscription_status === "trialing" &&
    !!company.trial_ends_at &&
    new Date(company.trial_ends_at).getTime() < Date.now()
  );
}

// Only meaningful while still trialing and not yet expired -- null
// otherwise (no countdown to show for an active/canceled subscription).
export function trialDaysRemaining(company: SubscriptionInfo): number | null {
  if (company.subscription_status !== "trialing" || !company.trial_ends_at) return null;
  const msRemaining = new Date(company.trial_ends_at).getTime() - Date.now();
  if (msRemaining <= 0) return null;
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}
