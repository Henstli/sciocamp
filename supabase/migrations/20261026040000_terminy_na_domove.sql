-- Volba v Nastavení: ukazovat na Domově pruh s úkoly, kterým do 24 hodin končí termín.
alter table public.profiles add column home_due_alerts boolean not null default true;
comment on column public.profiles.home_due_alerts is 'Ukazovat na Domově blížící se termíny úkolů.';
grant update (home_due_alerts) on public.profiles to authenticated;
