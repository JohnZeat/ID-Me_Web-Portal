-- Reflects the actual Stripe setup: middle tier boundary changed from
-- 50 to 100 units, and the real (test-mode) Stripe Price ID.
update plan_seat_tiers
set max_seats = 100
where min_seats = 21;

update plan_seat_tiers
set min_seats = 101
where min_seats = 51;

update plans
set stripe_price_id = 'price_1U0rdW2LgrPNeOKuWFsMiOBI'
where name = 'Per-Seat';
