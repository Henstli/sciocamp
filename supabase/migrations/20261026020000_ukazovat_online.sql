-- Volba v Nastavení: ukazovat ostatním, že jsem online (výchozí ano).
alter table public.profiles add column show_online boolean not null default true;
comment on column public.profiles.show_online is 'Ukazovat ostatním zelenou tečku „online“.';
grant update (show_online) on public.profiles to authenticated;
