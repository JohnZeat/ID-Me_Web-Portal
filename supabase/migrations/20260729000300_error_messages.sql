-- Error matrix: translates stable error codes (used across both the
-- staff portal and the public verify-code endpoint) into guidance HTML.
--
-- Lookup order: company-specific override -> Global fallback -> the
-- action's own plain-text message (handled in application code, not
-- here). The Global company is a sentinel row, not a real subscriber --
-- it exists purely as the anchor for company_id on default entries and
-- as the starting template for newly onboarded companies.

insert into companies (id, name)
values ('00000000-0000-0000-0000-000000000000', 'Global')
on conflict (id) do nothing;

create table error_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  error_code text not null,
  title text not null,
  guidance_html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, error_code)
);

create index error_messages_lookup_idx on error_messages (company_id, error_code);

create trigger error_messages_set_updated_at
  before update on error_messages
  for each row
  execute function set_updated_at();

alter table error_messages enable row level security;

-- Staff can view guidance for their own company plus the Global
-- fallback row -- needed so the dashboard/admin UI can resolve
-- company-aware guidance while signed in.
create policy "staff can view own company or global error messages"
  on error_messages for select
  using (
    company_id = '00000000-0000-0000-0000-000000000000'
    or company_id in (select company_id from staff where id = auth.uid())
  );

-- Admins can override guidance for their own company. Editing Global
-- defaults is a platform-operator action (service role / SQL) for now --
-- no admin UI for that yet, and this policy can't reach Global rows
-- since an admin's own company_id is never the Global sentinel.
create policy "admins can manage own company error messages"
  on error_messages for all
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

-- Seed Global defaults for every error code currently in use.
insert into error_messages (company_id, error_code, title, guidance_html) values
  ('00000000-0000-0000-0000-000000000000', 'NOT_SIGNED_IN', 'Sign-in required',
   '<p>You need to sign in to do that. <a href="/login">Go to sign in</a>.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'NOT_PROVISIONED', 'Account not set up',
   '<p>Your account isn''t linked to a company yet. Contact your admin and ask them to add you as staff.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'ADMIN_REQUIRED', 'Admins only',
   '<p>This action is restricted to company admins. Contact your company admin if you need access.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'DB_ERROR', 'Something went wrong',
   '<p>We hit an unexpected error saving that. Please try again in a moment, and contact support if it keeps happening.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'CUSTOMER_NOT_ACCESSIBLE', 'Customer not found',
   '<p>That customer couldn''t be found in your company''s records. Double-check you searched the right customer, or add them first.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'NO_FILE', 'No file selected',
   '<p>Choose a CSV file before uploading.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'CSV_INVALID_HEADERS', 'CSV format not recognized',
   '<p>Your file needs <code>full_name</code>, <code>dob</code>, and <code>mobile_number</code> columns in the header row. <code>metadata</code> is optional.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'INVALID_EMAIL', 'Invalid email address',
   '<p>That doesn''t look like a valid email address. Double-check it and try again.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'DOMAIN_NOT_REGISTERED', 'Email domain not recognized',
   '<p>That email''s domain isn''t registered to your company yet. An admin needs to add it before you can invite this address.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'USER_ALREADY_EXISTS', 'Already invited',
   '<p>This person already has an account. If they can''t sign in, ask them to use "Forgot password" instead of a new invite.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'INVITE_FAILED', 'Invite couldn''t be sent',
   '<p>We couldn''t send that invite. Please try again, and contact support if it keeps happening.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'INVALID_REQUEST', 'Invalid code format',
   '<p>Enter the 6-digit code exactly as shown, along with the mobile number on file.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'NO_MATCH', 'Code not recognized',
   '<p>That code and mobile number don''t match, or the code has expired. Codes are valid for 2 minutes -- ask staff for a new one.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'SERVER_ERROR', 'Something went wrong',
   '<p>We hit an unexpected error verifying that. Please try again in a moment.</p>'),
  ('00000000-0000-0000-0000-000000000000', 'UNKNOWN', 'Something went wrong',
   '<p>An unexpected error occurred. Please try again, and contact support if it keeps happening.</p>')
on conflict (company_id, error_code) do nothing;
