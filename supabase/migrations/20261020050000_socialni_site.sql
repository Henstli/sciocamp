-- Sociální sítě v profilu (Instagram a Discord).
-- Vyplňuje si je každý sám, vidí je všichni přihlášení ve škole.

create table public.profile_socials (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  discord text check (discord ~ '^[a-z0-9._]{2,32}$'),
  updated_at timestamptz not null default now()
);
comment on table public.profile_socials is 'Sociální sítě v profilu: uživatelská jména na Instagramu a Discordu.';

alter table public.profile_socials enable row level security;
revoke all on public.profile_socials from anon, authenticated;
grant select, insert, update, delete on public.profile_socials to authenticated;

create policy "členové vidí sociální sítě" on public.profile_socials
  for select to authenticated using (public.is_member());
create policy "každý upravuje své" on public.profile_socials
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_member())
  with check (user_id = (select auth.uid()) and public.is_member());
