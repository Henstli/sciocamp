-- Nápověda: „Pomohl ti návod?“ — jedna odpověď na člověka a návod (jde změnit).
-- Návody samotné jsou v aplikaci (src/lib/help/guides.ts), tady je jen zpětná vazba.

create table public.help_feedback (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  helpful boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);
comment on table public.help_feedback is 'Odpovědi „Pomohl ti návod?“ v Nápovědě. Souhrn vidí admin ve Správě → Nástroje.';

alter table public.help_feedback enable row level security;
create policy "svoje odpovědi v nápovědě" on public.help_feedback for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "odpovědět v nápovědě" on public.help_feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member());
create policy "změnit svoji odpověď" on public.help_feedback for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update (helpful, updated_at) on public.help_feedback to authenticated;
