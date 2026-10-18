-- Telefon v profilu. Číslo vyučujícího (učitel, admin) vidí všichni členové
-- školy, číslo studenta jen učitelé a admini (a student sám). Proto je
-- ve zvláštní tabulce s vlastními pravidly, ne v profiles (ty vidí všichni).

create table public.profile_contacts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null check (phone ~ '^\+?[0-9 ]{9,20}$'),
  updated_at timestamptz not null default now()
);

create function public.is_staff_profile(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = person and p.role in ('ucitel', 'admin'))
$$;

alter table public.profile_contacts enable row level security;
revoke all on public.profile_contacts from anon, authenticated;
grant select, insert, update, delete on public.profile_contacts to authenticated;

create policy "kdo vidí telefon" on public.profile_contacts
  for select to authenticated
  using (
    public.is_member()
    and (user_id = (select auth.uid()) or public.is_staff() or public.is_staff_profile(user_id))
  );
create policy "vlastní telefon: přidat" on public.profile_contacts
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member());
create policy "vlastní telefon: změnit" on public.profile_contacts
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member())
  with check (user_id = (select auth.uid()));
create policy "vlastní telefon: smazat" on public.profile_contacts
  for delete to authenticated using (user_id = (select auth.uid()) and public.is_member());

revoke execute on function public.is_staff_profile from public, anon;
grant execute on function public.is_staff_profile to authenticated;
