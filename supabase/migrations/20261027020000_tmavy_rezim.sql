-- Vzhled aplikace (Profil → Vzhled): světlý, tmavý, nebo podle zařízení.
alter table public.profiles add column theme text not null default 'light'
  check (theme in ('light', 'dark', 'system'));
comment on column public.profiles.theme is 'Vzhled aplikace: light / dark / system.';
grant update (theme) on public.profiles to authenticated;
