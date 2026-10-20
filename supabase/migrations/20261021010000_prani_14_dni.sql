-- Přání v Hlasování platí 14 dní. Co se do té doby nevypíše (otevřené i
-- uzavřené), smaže se. Mazání spouští aplikace při otevření Hlasování;
-- aplikace navíc prošlá přání nezobrazuje.

create index wishes_created_idx on public.wishes (created_at);

/** Smaže nevypsaná přání starší 14 dní. Smí kdokoli přihlášený (maže jen prošlá). */
create function public.purge_expired_wishes() returns void
language sql security definer set search_path = '' as $$
  delete from public.wishes
  where status <> 'vypsano' and created_at < now() - interval '14 days'
$$;
revoke execute on function public.purge_expired_wishes from public, anon;
grant execute on function public.purge_expired_wishes to authenticated;

-- Vrácené přání (omyl při vypsání / uzavření) dostane nových 14 dní.
create or replace function public.reopen_wish(wish uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Jen vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  update public.wishes
  set status = 'open', activity_id = null, note = null, closed_by = null, closed_at = null, created_at = now()
  where id = wish;
end;
$$;

-- Vypsaná aktivita bývá do vyhlášení zápisu studentům skrytá → oznámení vede do Zápisů.
create or replace function public.fulfil_wish(wish uuid, activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wishes;
  a public.activities;
begin
  if not public.is_staff() then
    raise exception 'Přání vypisuje vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.activities where id = activity;
  if a.id is null then
    raise exception 'Aktivita neexistuje.' using errcode = 'check_violation';
  end if;
  update public.wishes
  set status = 'vypsano', activity_id = activity, closed_by = auth.uid(), closed_at = now(), note = null
  where id = wish and status = 'open'
  returning * into w;
  if w.id is null then
    raise exception 'Přání už je uzavřené.' using errcode = 'check_violation';
  end if;
  perform public.notify(
    (select array_agg(user_id) from public.wish_votes where wish_id = wish),
    'prani',
    'Vypsáno: ' || a.title,
    'Přání „' || w.title || '“ se splnilo. Zapsat se půjde v Zápisech, až se zápis otevře.',
    '/zapisy'
  );
end;
$$;
