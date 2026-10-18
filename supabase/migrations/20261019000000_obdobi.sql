-- Kurzová období, termíny aktivit a místo místo učebny.
--
-- Škola má 4 kurzová období za rok (2 za pololetí). Tabulka „blocks“ jsou
-- právě tato období (spravuje je admin). Kurz trvá celé období. Ateliér je
-- kratší — má vlastní od–do uvnitř období a během jednoho období se u studenta
-- vystřídají 3–4. Ostatní akce (expedice) mají vlastní od–do, např. 1–5 dní.
-- Výuka je online, učebny nejsou; „místo“ je nepovinné (např. kam se jede).

alter table public.activities rename column room to location;
alter table public.activities alter column location drop not null;
alter table public.activities alter column location drop default;
update public.activities set location = null where location = '';

alter table public.activities
  add column starts_on date,
  add column ends_on date,
  add constraint activity_dates check (starts_on is null or ends_on is null or ends_on >= starts_on);

comment on column public.activities.block_id is 'Kurzové období (tabulka blocks). Kurz trvá celé období.';
comment on column public.activities.starts_on is 'Vlastní začátek (ateliér, expedice). Prázdné = od začátku období.';
comment on column public.activities.location is 'Nepovinné místo konání, výuka je jinak online.';

create index activities_block_idx on public.activities (block_id);

comment on table public.blocks is 'Kurzová období (4 za školní rok). Spravuje admin.';

-- Skutečné trvání aktivity: vlastní data, jinak data období, jinak neomezeně.
create function public.activity_range(activity uuid) returns daterange
language sql stable security definer set search_path = '' as $$
  select daterange(
    coalesce(a.starts_on, b.starts_on),
    greatest(coalesce(a.ends_on, b.ends_on), coalesce(a.starts_on, b.starts_on)),
    '[]'
  )
  from public.activities a
  left join public.blocks b on b.id = a.block_id
  where a.id = activity
$$;

-- Student smí být v jednu dobu zapsaný jen v jednom ateliéru (kurzů může mít víc).
create function public.guard_one_atelier() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  clash text;
begin
  if (select kind from public.activities where id = new.activity_id) <> 'atelier' then
    return new;
  end if;
  select o.title into clash
  from public.enrollments e
  join public.activities o on o.id = e.activity_id
  where e.student_id = new.student_id
    and o.kind = 'atelier'
    and o.id <> new.activity_id
    and public.activity_range(o.id) && public.activity_range(new.activity_id)
  limit 1;
  if clash is not null then
    raise exception 'Student je ve stejné době zapsaný v ateliéru „%“.', clash using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create trigger guard_one_atelier
  before insert on public.enrollments
  for each row execute function public.guard_one_atelier();

-- Totéž při změně termínu ateliéru: nesmí se překrýt s jiným ateliérem zapsaných studentů.
create function public.guard_atelier_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  clash text;
begin
  if new.kind <> 'atelier' then
    return new;
  end if;
  select o.title into clash
  from public.enrollments mine
  join public.enrollments e on e.student_id = mine.student_id and e.activity_id <> new.id
  join public.activities o on o.id = e.activity_id and o.kind = 'atelier'
  left join public.blocks b on b.id = new.block_id
  where mine.activity_id = new.id
    and public.activity_range(o.id) && daterange(
      coalesce(new.starts_on, b.starts_on),
      greatest(coalesce(new.ends_on, b.ends_on), coalesce(new.starts_on, b.starts_on)),
      '[]'
    )
  limit 1;
  if clash is not null then
    raise exception 'V nových termínech by se ateliér překrýval s ateliérem „%“ u zapsaných studentů.', clash
      using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create trigger guard_atelier_dates
  before update of kind, starts_on, ends_on, block_id on public.activities
  for each row execute function public.guard_atelier_dates();

revoke execute on function public.activity_range, public.guard_one_atelier, public.guard_atelier_dates from public, anon, authenticated;
