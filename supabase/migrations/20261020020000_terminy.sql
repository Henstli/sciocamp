-- Termíny ateliérů a expedic + vyhlášení všeho najednou.
--
-- Admin předem zadá termíny (activity_terms): ateliéry trvají několik dní až
-- desítky dní, expedice jednou za měsíc po–pá. Učitel u ateliéru / expedice jen
-- vybere termín ze seznamu; data aktivity (starts_on/ends_on) a období se
-- doplní samy a drží se s termínem (i když ho admin později posune).
--
-- Při zveřejnění kurzů období může admin rovnou vyhlásit i připravené ateliéry
-- a expedice se stejným termínem zápisu (publish_block s příznaky).

create table public.activity_terms (
  id uuid primary key default gen_random_uuid(),
  kind public.activity_kind not null check (kind::text in ('atelier', 'expedice')),
  name text check (name is null or length(trim(name)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
comment on table public.activity_terms is 'Termíny ateliérů a expedic, které předem zadává admin.';
create index activity_terms_dates_idx on public.activity_terms (kind, starts_on);

alter table public.activities add column term_id uuid references public.activity_terms (id) on delete set null;
create index activities_term_idx on public.activities (term_id);

/** Období, do kterého den spadá (jinak null). */
create function public.block_of(day date) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.id from public.blocks b where day between b.starts_on and b.ends_on order by b.starts_on limit 1
$$;

-- Aktivita s termínem převezme jeho data a období.
create function public.apply_activity_term() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.activity_terms;
begin
  if new.term_id is null then
    return new;
  end if;
  select * into t from public.activity_terms where id = new.term_id;
  if t.kind <> new.kind then
    raise exception 'Termín je pro jiný druh (ateliér / expedice).' using errcode = 'check_violation';
  end if;
  new.starts_on := t.starts_on;
  new.ends_on := t.ends_on;
  new.block_id := public.block_of(t.starts_on);
  return new;
end;
$$;
-- Jméno „a_…“, aby běžel před ostatními kontrolami termínů (triggery jdou podle abecedy).
create trigger a_apply_activity_term before insert or update of term_id, kind, starts_on, ends_on, block_id on public.activities
  for each row execute function public.apply_activity_term();

-- Posunutý termín posune i jeho ateliéry / expedice.
create function public.sync_term_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.activities
  set starts_on = new.starts_on, ends_on = new.ends_on, block_id = public.block_of(new.starts_on)
  where term_id = new.id;
  return null;
end;
$$;
create trigger sync_term_dates after update of starts_on, ends_on on public.activity_terms
  for each row execute function public.sync_term_dates();

alter table public.activity_terms enable row level security;
revoke all on public.activity_terms from anon, authenticated;
grant select, insert, update, delete on public.activity_terms to authenticated;
create policy "členové vidí termíny" on public.activity_terms
  for select to authenticated using (public.is_member());
create policy "admin spravuje termíny" on public.activity_terms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Zveřejnění období: kurzy a volitelně i připravené ateliéry a expedice
-- ---------------------------------------------------------------------------

drop function public.publish_block(uuid);

/**
 * Zařadí připravené ateliéry / expedice do zápisu: do běžícího kola, nebo do
 * nového kola s daným termínem. Vrací počet zařazených.
 */
create function public.announce_ready_kind(round_kind text, opens timestamptz, closes timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  items uuid[];
  r uuid;
begin
  select coalesce(array_agg(a.id), '{}') into items
  from public.activities a
  where a.kind::text = round_kind and a.announce_ready and public.round_free(a.id)
    and (a.ends_on is null or a.ends_on >= current_date);
  if coalesce(array_length(items, 1), 0) = 0 then
    return 0;
  end if;
  select x.id into r from public.enroll_rounds x
  where x.kind::text = round_kind and x.closes_at > now() order by x.opens_at limit 1;
  if r is null then
    insert into public.enroll_rounds (kind, opens_at, closes_at) values (round_kind::public.activity_kind, opens, closes) returning id into r;
  end if;
  update public.activities set round_id = r, published = true, announce_ready = false where id = any (items);
  return array_length(items, 1);
end;
$$;

create function public.publish_block(block uuid, with_ateliers boolean default false, with_expeditions boolean default false)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.blocks;
  first_time boolean;
  courses integer;
  ateliers integer := 0;
  expeditions integer := 0;
  extra text := '';
begin
  if not public.is_admin() then
    raise exception 'Období zveřejňuje admin.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.blocks where id = block for update;
  if b.id is null then
    raise exception 'Období neexistuje.' using errcode = 'no_data_found';
  end if;
  if b.enroll_opens_at is null or b.enroll_closes_at is null then
    raise exception 'Nejdřív nastav, kdy se zápis otevře a kdy skončí.' using errcode = 'check_violation';
  end if;
  first_time := b.published_at is null;
  update public.blocks set published_at = coalesce(published_at, now()) where id = block;
  update public.activities set published = true where block_id = block and kind = 'kurz' and not published;
  get diagnostics courses = row_count;
  if with_ateliers then
    ateliers := public.announce_ready_kind('atelier', b.enroll_opens_at, b.enroll_closes_at);
  end if;
  if with_expeditions then
    expeditions := public.announce_ready_kind('expedice', b.enroll_opens_at, b.enroll_closes_at);
  end if;

  if ateliers > 0 then
    extra := extra || ', ateliéry (' || ateliers || ')';
  end if;
  if expeditions > 0 then
    extra := extra || ', expedice (' || expeditions || ')';
  end if;
  if first_time or ateliers > 0 or expeditions > 0 then
    perform public.notify_students(
      null, 'zapis', 'Zápis: ' || b.name,
      'Kurzy' || extra || ' · otevře se ' || public.prague_stamp(b.enroll_opens_at) || ', skončí '
        || public.prague_stamp(b.enroll_closes_at) || '.',
      '/zapisy'
    );
  end if;
  return courses || ':' || ateliers || ':' || expeditions;
end;
$$;

revoke execute on function public.block_of, public.apply_activity_term, public.sync_term_dates,
  public.announce_ready_kind, public.publish_block from public, anon;
revoke execute on function public.block_of, public.apply_activity_term, public.sync_term_dates,
  public.announce_ready_kind from authenticated;
grant execute on function public.publish_block to authenticated;
