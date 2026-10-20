-- Schválená (vypsaná) přání zůstanou v Hlasování týden od vypsání, pak se smažou.
-- Nevypsaná (otevřená i uzavřená) dál po 14 dnech od přidání.
create or replace function public.purge_expired_wishes() returns void
language sql security definer set search_path = '' as $$
  delete from public.wishes
  where (status <> 'vypsano' and created_at < now() - interval '14 days')
     or (status = 'vypsano' and closed_at < now() - interval '7 days')
$$;
