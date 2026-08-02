-- The code-expiry migration added a join to companies inside
-- generate_customer_code(), which runs as SECURITY INVOKER (RLS
-- applies to the calling staff member). companies had RLS enabled
-- with zero policies, so that join silently returned nothing for
-- every staff member -- breaking code generation for all customers,
-- not just a specific one. Staff can view their own company's row.
create policy "staff can view own company"
  on companies for select
  using (
    id in (select company_id from staff where id = auth.uid())
  );
