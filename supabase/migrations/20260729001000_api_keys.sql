-- API keys let a subscribing company's own systems (CRM, POS, customer
-- data platform) call our API directly, instead of only through the
-- staff dashboard. Only a SHA-256 hash of the key is stored -- the raw
-- key is shown once at creation time and never recoverable afterward,
-- same principle as password storage.

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_company_id_idx on api_keys (company_id);

-- Speeds up the auth lookup in api-key-protected routes (hash the
-- incoming key, look up by hash) -- only active keys need to be fast.
create index api_keys_active_hash_idx on api_keys (key_hash) where revoked_at is null;

alter table api_keys enable row level security;

create policy "admins can manage own company api keys"
  on api_keys for all
  using (
    company_id in (
      select company_id from staff
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    company_id in (
      select company_id from staff
      where id = auth.uid() and role = 'admin'
    )
  );
