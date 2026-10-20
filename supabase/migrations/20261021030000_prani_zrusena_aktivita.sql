-- 1) Když se vypsaná aktivita smaže (activity_id → null), schválené přání se
--    změní na uzavřené a hlasující dostanou oznámení.
-- 2) Schválená i uzavřená přání zůstanou v Hlasování 7 dní od rozhodnutí,
--    otevřená 14 dní od přidání; pak se smažou.

create function public.before_wish_activity_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'vypsano' and new.status = 'vypsano' and old.activity_id is not null and new.activity_id is null then
    new.status := 'uzavreno';
    new.note := 'Vypsaná aktivita byla zrušena.';
    new.closed_at := now();
    perform public.notify(
      (select array_agg(user_id) from public.wish_votes where wish_id = new.id),
      'prani', 'Zrušeno: ' || new.title, 'Aktivita vypsaná podle tohoto přání byla zrušena.', '/hlasovani'
    );
  end if;
  return new;
end;
$$;
create trigger wish_activity_gone before update of activity_id on public.wishes
  for each row execute function public.before_wish_activity_gone();
revoke execute on function public.before_wish_activity_gone from public, anon, authenticated;

create or replace function public.purge_expired_wishes() returns void
language sql security definer set search_path = '' as $$
  delete from public.wishes
  where (status = 'open' and created_at < now() - interval '14 days')
     or (status <> 'open' and coalesce(closed_at, created_at) < now() - interval '7 days')
$$;
