-- Per-company display date format, plus a jsonb catch-all for future
-- settings that don't warrant their own typed column/migration.
alter table companies
  add column date_format text not null default 'DD/MM/YYYY'
    check (date_format in ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')),
  add column settings jsonb not null default '{}'::jsonb;
