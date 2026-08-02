-- Makes code expiry configurable per company instead of hardcoded to
-- 2 minutes in generate_customer_code().

alter table companies
  add column code_expiry_seconds integer not null default 120
    check (code_expiry_seconds > 0 and code_expiry_seconds <= 3600);

create or replace function generate_customer_code(p_customer_id uuid)
returns codes
language plpgsql
as $$
declare
  v_company_id uuid;
  v_expiry_seconds integer;
  v_code text;
  v_result codes;
begin
  select c.company_id, co.code_expiry_seconds
    into v_company_id, v_expiry_seconds
  from customers c
  join companies co on co.id = c.company_id
  where c.id = p_customer_id;

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
  values (
    v_company_id,
    p_customer_id,
    v_code,
    now() + (v_expiry_seconds || ' seconds')::interval,
    auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;
