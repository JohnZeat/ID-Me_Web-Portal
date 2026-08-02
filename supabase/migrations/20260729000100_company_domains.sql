-- Maps verified email domains to companies.
--
-- Provisioning model: a domain match only narrows which company an
-- invited user *can* be assigned to (used by the admin invite flow,
-- step 3) -- it does NOT by itself grant portal access. Access is
-- granted exclusively by the presence of a row in `staff`. A user
-- authenticating with a matching domain but no `staff` row must still
-- be explicitly invited by an admin.

create table company_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  domain text not null unique
    check (domain = lower(domain))
    check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  created_at timestamptz not null default now()
);

create index company_domains_company_id_idx on company_domains (company_id);

alter table company_domains enable row level security;

-- Only admins manage domains for their own company -- this controls who
-- is eligible to be invited, so it's an admin-only, own-company action.
create policy "admins can view own company domains"
  on company_domains for select
  using (
    company_id in (
      select company_id from staff
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "admins can add own company domains"
  on company_domains for insert
  with check (
    company_id in (
      select company_id from staff
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "admins can remove own company domains"
  on company_domains for delete
  using (
    company_id in (
      select company_id from staff
      where id = auth.uid() and role = 'admin'
    )
  );
