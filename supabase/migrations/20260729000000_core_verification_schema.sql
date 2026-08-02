-- Core verification loop schema: companies, staff, customers.
-- Multi-tenant from the start: every customer belongs to a company, and
-- RLS scopes staff to their own company's customers via the staff table.

create extension if not exists "pgcrypto";

-- Shared trigger to keep updated_at current on row updates.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Subscribing companies.
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table companies enable row level security;

-- Maps an authenticated staff user to their company.
-- id references auth.users(id) directly — one staff row per user.
create table staff (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references companies (id) on delete restrict,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz not null default now()
);

create index staff_company_id_idx on staff (company_id);

alter table staff enable row level security;

create policy "staff can view own row"
  on staff for select
  using (id = auth.uid());

-- Customers, scoped per company. full_name + dob is the human-matching
-- pair (unique per company, not globally — the same name/DOB can
-- legitimately belong to different companies' customer lists).
create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  full_name text not null,
  dob date not null,
  mobile_number text not null check (mobile_number ~ '^\+[1-9]\d{1,14}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, full_name, dob)
);

create index customers_company_id_idx on customers (company_id);
create index customers_mobile_number_idx on customers (mobile_number);

create trigger customers_set_updated_at
  before update on customers
  for each row
  execute function set_updated_at();

alter table customers enable row level security;

create policy "staff can view customers in their company"
  on customers for select
  using (
    company_id in (select company_id from staff where id = auth.uid())
  );

create policy "staff can insert customers in their company"
  on customers for insert
  with check (
    company_id in (select company_id from staff where id = auth.uid())
  );

create policy "staff can update customers in their company"
  on customers for update
  using (
    company_id in (select company_id from staff where id = auth.uid())
  );
