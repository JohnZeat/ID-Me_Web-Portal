-- Verification codes: staff generate a 6-digit, 2-minute code against a
-- customer; the (separate, not-yet-built) customer app verifies it via
-- the public /api/verify-code route using the service role key.

create table codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index codes_customer_id_idx on codes (customer_id);
create index codes_company_id_idx on codes (company_id);

-- Speeds up the verify endpoint's lookup of currently-active codes.
create index codes_active_code_idx on codes (code) where used_at is null;

alter table codes enable row level security;

create policy "staff can view codes in their company"
  on codes for select
  using (
    company_id in (select company_id from staff where id = auth.uid())
  );

create policy "staff can insert codes in their company"
  on codes for insert
  with check (
    company_id in (select company_id from staff where id = auth.uid())
  );

create policy "staff can update codes in their company"
  on codes for update
  using (
    company_id in (select company_id from staff where id = auth.uid())
  );

-- Atomically supersedes any still-active code for the customer and
-- issues a new one. Runs as the caller (security invoker, the default)
-- so RLS on `customers`/`codes` applies exactly as if the staff member
-- ran these statements directly -- a staff member can only generate a
-- code for a customer already visible to them under the existing
-- company-scoped select policy.
create or replace function generate_customer_code(p_customer_id uuid)
returns codes
language plpgsql
as $$
declare
  v_company_id uuid;
  v_code text;
  v_result codes;
begin
  select company_id into v_company_id
  from customers
  where id = p_customer_id;

  if v_company_id is null then
    raise exception 'Customer not found or not accessible';
  end if;

  update codes
  set expires_at = now()
  where customer_id = p_customer_id
    and used_at is null
    and expires_at > now();

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  insert into codes (company_id, customer_id, code, expires_at, created_by)
  values (v_company_id, p_customer_id, v_code, now() + interval '2 minutes', auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;
