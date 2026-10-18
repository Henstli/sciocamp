-- Doladění podle bezpečnostní kontroly Supabase (Advisors):
-- pevný search_path u pomocných funkcí a funkce pro triggery nejsou volatelné přes API.

create or replace function public.school_domain() returns text
language sql immutable set search_path = '' as $$ select 'scioskola.cz' $$;

create or replace function public.is_school_email(email text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(coalesce(email, '')) like '%@' || public.school_domain()
$$;

revoke execute on function public.guard_school_domain, public.handle_new_user, public.handle_user_sign_in
  from authenticated;
