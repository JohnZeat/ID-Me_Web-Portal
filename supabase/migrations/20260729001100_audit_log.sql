-- Audit log for administrative actions taken in /admin (staff invited/
-- removed, settings changed, domains added/removed, API keys created/
-- revoked, bulk CSV uploads). Code generation/verification isn't
-- covered here -- that's implicitly tracked in the codes table itself,
-- and a unified view can be revisited later if wanted.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_company_id_created_at_idx on audit_log (company_id, created_at desc);

alter table audit_log enable row level security;

create policy "admins can view own company audit log"
  on audit_log for select
  using (
    company_id in (
      select company_id from staff
      where id = auth.uid() and role = 'admin'
    )
  );

-- Every write comes from an already requireAdmin()-gated action, so
-- inserting via the regular client (rather than the service role) is
-- fine and simpler -- this policy is what allows it.
create policy "admins can insert own company audit log"
  on audit_log for insert
  with check (
    company_id in (
      select company_id from staff
      where id = auth.uid() and role = 'admin'
    )
  );
