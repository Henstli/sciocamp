-- Důležitá oznámení od admina zvýrazněně na Domově (např. „Zítra výuka odpadá“).
-- Admin je zakládá a ruší ve Správě → Oznámení. Pro koho (vsichni / studenti /
-- vyucujici) a do kdy (ends_at, null = dokud ho admin neukončí). Každý si ho může
-- skrýt („Rozumím“). Při založení přijde všem z cílové skupiny i notifikace.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null default '' check (length(body) <= 1500),
  link_url text check (link_url is null or link_url ~ '^https?://'),
  audience text not null default 'vsichni' check (audience in ('vsichni', 'studenti', 'vyucujici')),
  ends_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index announcements_created_idx on public.announcements (created_at desc);

create table public.announcement_dismissals (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

/** Je oznámení určené přihlášenému? */
create function public.announcement_for_me(aud text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case aud
    when 'vsichni' then public.is_member()
    when 'studenti' then public.my_role() = 'student'
    when 'vyucujici' then public.is_staff()
    else false
  end
$$;

alter table public.announcements enable row level security;
alter table public.announcement_dismissals enable row level security;

create policy "oznámení: čte cílová skupina a admin" on public.announcements
  for select to authenticated using (public.is_admin() or public.announcement_for_me(audience));
create policy "oznámení: zakládá admin" on public.announcements
  for insert to authenticated with check (public.is_admin() and created_by = (select auth.uid()));
create policy "oznámení: upravuje admin" on public.announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "oznámení: maže admin" on public.announcements
  for delete to authenticated using (public.is_admin());

create policy "skrytá oznámení: svoje" on public.announcement_dismissals
  for select to authenticated using (user_id = (select auth.uid()));
create policy "skrytá oznámení: skrýt si" on public.announcement_dismissals
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member());
create policy "skrytá oznámení: znovu ukázat" on public.announcement_dismissals
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on public.announcements to authenticated;
grant update (ends_at) on public.announcements to authenticated;
grant select, insert, delete on public.announcement_dismissals to authenticated;

-- Nové oznámení → notifikace cílové skupině (kromě autora).
create function public.notify_announcement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(
    (select coalesce(array_agg(p.id), '{}') from public.profiles p
     where not p.blocked and case new.audience
       when 'studenti' then p.role = 'student'
       when 'vyucujici' then p.role in ('ucitel', 'admin')
       else true end),
    'skola', new.title, nullif(left(new.body, 140), ''), '/'
  );
  return null;
end;
$$;
create trigger notify_announcement after insert on public.announcements
  for each row execute function public.notify_announcement();
revoke execute on function public.notify_announcement from public, anon, authenticated;
