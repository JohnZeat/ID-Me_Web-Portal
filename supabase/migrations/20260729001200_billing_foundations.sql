-- Phase 1 of subscriber/billing work: data model only, no UI yet.
-- Three pieces: plan tiers, subscription state on companies, and a
-- platform_admins table for ID-Me's own team (not scoped to any
-- company, unlike staff). Stripe wiring and the actual platform admin
-- area are later phases -- this just gets the schema in place.

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  stripe_price_id text,
  seat_limit integer check (seat_limit > 0), -- null = unlimited
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Placeholder tiers to have something concrete to build/test against --
-- names, pricing, and seat limits are all expected to change once real
-- Stripe products/prices exist (Phase 2).
insert into plans (name, seat_limit, monthly_price_cents) values
  ('Starter', 5, 4900),
  ('Growth', 20, 14900),
  ('Enterprise', null, 39900);

alter table companies
  add column plan_id uuid references plans (id),
  add column subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column trial_ends_at timestamptz;

-- ID-Me's own team, not a subscriber's staff -- deliberately has no
-- company_id. Provisioned manually via SQL for now; a real
-- provisioning flow is Phase 5 (platform admin area) territory.
create table platform_admins (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

create policy "platform admins can view own row"
  on platform_admins for select
  using (id = auth.uid());
