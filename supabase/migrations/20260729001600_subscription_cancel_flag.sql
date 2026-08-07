-- Tracks whether a subscription is scheduled to cancel at the end of
-- the current billing period, kept in sync via the Stripe webhook
-- (customer.subscription.updated carries cancel_at_period_end). Lets
-- the Subscription tab show "cancels on <date>" without a live Stripe
-- API call on every admin page render.

alter table companies
  add column cancel_at_period_end boolean not null default false;
