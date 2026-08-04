-- codes.created_by referenced auth.users(id) with no ON DELETE behavior,
-- which defaults to blocking the delete -- offboarding a staff member
-- who had ever generated a code would fail with a foreign key
-- violation. Preserve the code's audit history (customer, timestamps)
-- but null out the creator reference once that staff account is gone.
alter table codes alter column created_by drop not null;

alter table codes drop constraint codes_created_by_fkey;

alter table codes
  add constraint codes_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
