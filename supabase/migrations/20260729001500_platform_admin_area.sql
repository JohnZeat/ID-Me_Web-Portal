-- Phase 5: platform admin area. Suspension is a platform-admin-imposed
-- lock, independent of billing status -- a company can be actively
-- paying and still suspended (e.g. policy violation), so this is a
-- separate column rather than overloading subscription_status.
alter table companies add column suspended_at timestamptz;
