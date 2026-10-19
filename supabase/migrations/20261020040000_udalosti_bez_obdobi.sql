-- Události a expedice do kurzového období nepatří (období mají jen kurzy a ateliéry).

update public.activities set block_id = null where kind::text in ('ostatni', 'expedice') and block_id is not null;

create or replace function public.apply_activity_term() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.activity_terms;
begin
  if new.kind::text in ('ostatni', 'expedice') then
    new.block_id := null;
  end if;
  if new.term_id is null then
    return new;
  end if;
  select * into t from public.activity_terms where id = new.term_id;
  if t.kind <> new.kind then
    raise exception 'Termín je pro jiný druh (ateliér / expedice).' using errcode = 'check_violation';
  end if;
  new.starts_on := t.starts_on;
  new.ends_on := t.ends_on;
  if new.kind::text = 'atelier' then
    new.block_id := public.block_of(t.starts_on);
  end if;
  return new;
end;
$$;

create or replace function public.sync_term_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.activities
  set starts_on = new.starts_on, ends_on = new.ends_on,
      block_id = case when kind::text = 'atelier' then public.block_of(new.starts_on) else null end
  where term_id = new.id;
  return null;
end;
$$;
