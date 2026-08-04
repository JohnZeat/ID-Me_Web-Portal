-- Replaces the Phase 1 placeholder flat-rate tiers with a single
-- per-seat volume-priced plan, per the actual pitch deck pricing:
-- 1-20 seats @ $18/seat, 21-50 @ $15/seat, 51+ @ $13.50/seat -- volume
-- tiering, so the whole seat count bills at one rate (not graduated).
-- Stripe bundles this whole schedule into a single tiered Price object,
-- so stripe_price_id stays on plans (one ID), with plan_seat_tiers
-- mirroring the schedule here for our own display/calculation without
-- needing to call Stripe for it.

delete from plans;

alter table plans
  drop column seat_limit,
  drop column monthly_price_cents;

insert into plans (name) values ('Per-Seat');

create table plan_seat_tiers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans (id) on delete cascade,
  min_seats integer not null check (min_seats >= 1),
  max_seats integer check (max_seats is null or max_seats >= min_seats), -- null = unlimited
  price_per_seat_cents integer not null check (price_per_seat_cents >= 0),
  unique (plan_id, min_seats)
);

insert into plan_seat_tiers (plan_id, min_seats, max_seats, price_per_seat_cents)
select id, 1, 20, 1800 from plans where name = 'Per-Seat'
union all
select id, 21, 50, 1500 from plans where name = 'Per-Seat'
union all
select id, 51, null, 1350 from plans where name = 'Per-Seat';
