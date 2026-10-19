-- Zápisová kola ateliérů a expedic.
--
-- Ateliéry a expedice vyhlašují učitelé sami (bez admina), ale hromadně:
-- učitel označí svůj ateliér „Připraveno k vyhlášení“ (announce_ready) a kdokoli
-- z učitelů pak vyhlásí zápisové kolo (announce_round) se všemi připravenými
-- nabídkami a jedním termínem. Dokud kolo neskončí, nové kolo stejného druhu
-- vyhlásit nejde — pozdě připravený ateliér se přidá do běžícího (join_round).
-- Vlastní termín zápisu u aktivity (předchozí migrace) se ruší.

drop trigger notify_activity_published on public.activities;
drop function public.notify_activity_published();

alter table public.activities drop constraint activity_enroll_window;
alter table public.activities drop column enroll_opens_at, drop column enroll_closes_at;

create table public.enroll_rounds (
  id uuid primary key default gen_random_uuid(),
  kind public.activity_kind not null check (kind::text in ('atelier', 'expedice')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);
comment on table public.enroll_rounds is 'Společný termín zápisu pro víc ateliérů (nebo expedic) naráz.';

alter table public.activities
  add column round_id uuid references public.enroll_rounds (id) on delete set null,
  add column announce_ready boolean not null default false;
comment on column public.activities.round_id is 'Zápisové kolo ateliéru / expedice (termín zápisu).';
comment on column public.activities.announce_ready is 'Učitel má ateliér / expedici připravenou k vyhlášení zápisu.';
create index activities_round_idx on public.activities (round_id);

-- Termín zápisu: kurz z období, ateliér a expedice ze zápisového kola.
create or replace function public.enroll_window(activity uuid) returns tstzrange
language sql stable security definer set search_path = '' as $$
  select case
    when not a.published then null
    when a.kind = 'kurz' then
      case when b.published_at is not null and b.enroll_opens_at is not null and b.enroll_closes_at is not null
        then tstzrange(b.enroll_opens_at, b.enroll_closes_at, '[)') end
    when r.id is not null then tstzrange(r.opens_at, r.closes_at, '[)')
  end
  from public.activities a
  left join public.blocks b on b.id = a.block_id
  left join public.enroll_rounds r on r.id = a.round_id
  where a.id = activity
$$;

/** Smí přihlášený zařadit aktivitu do kola? Vlastní (nebo admin), cizí jen připravenou. */
create function public.can_announce(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() and exists (
    select 1 from public.activities a
    where a.id = activity and (a.announce_ready or public.is_admin() or public.teaches(a.id))
  )
$$;

/** Ateliér / expedice ještě není v žádném kole, které neskončilo. */
create function public.round_free(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.activities a join public.enroll_rounds r on r.id = a.round_id
    where a.id = activity and r.closes_at > now()
  )
$$;

/** Vyhlásí zápisové kolo s vybranými ateliéry (expedicemi) a jedním termínem. */
create function public.announce_round(round_kind text, opens timestamptz, closes timestamptz, items uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r uuid;
  running public.enroll_rounds;
  n integer;
begin
  if not public.is_staff() then
    raise exception 'Zápis vyhlašují učitelé.' using errcode = 'insufficient_privilege';
  end if;
  if round_kind not in ('atelier', 'expedice') then
    raise exception 'Kolo je jen pro ateliéry a expedice.' using errcode = 'check_violation';
  end if;
  if opens is null or closes is null or closes <= opens or closes <= now() then
    raise exception 'Zápis musí skončit až po otevření (a v budoucnu).' using errcode = 'check_violation';
  end if;
  select * into running from public.enroll_rounds x
  where x.kind::text = round_kind and x.closes_at > now() order by x.opens_at limit 1;
  if running.id is not null then
    raise exception 'Zápis % už je vyhlášený (% – %). Přidej nabídky do něj.',
      case when round_kind = 'expedice' then 'na expedice' else 'do ateliérů' end,
      public.prague_stamp(running.opens_at), public.prague_stamp(running.closes_at)
      using errcode = 'check_violation';
  end if;
  select count(*) into n from public.activities a
  where a.id = any (items) and a.kind::text = round_kind and public.can_announce(a.id) and public.round_free(a.id);
  if n = 0 or n <> coalesce(array_length(items, 1), 0) then
    raise exception 'Některou nabídku vyhlásit nejde (není připravená, je jiného druhu nebo už je v zápisu).'
      using errcode = 'check_violation';
  end if;

  insert into public.enroll_rounds (kind, opens_at, closes_at) values (round_kind::public.activity_kind, opens, closes) returning id into r;
  update public.activities set round_id = r, published = true, announce_ready = false where id = any (items);
  perform public.notify_students(
    null, 'zapis',
    case when round_kind = 'expedice' then 'Zápis na expedice' else 'Zápis do ateliérů' end,
    n || case when round_kind = 'expedice' then (case when n = 1 then ' expedice' else ' expedic' end)
              else (case when n = 1 then ' ateliér' when n < 5 then ' ateliéry' else ' ateliérů' end) end
      || ' · otevře se ' || public.prague_stamp(opens) || ', skončí ' || public.prague_stamp(closes) || '.',
    '/zapisy?tab=' || case when round_kind = 'expedice' then 'expedice' else 'ateliery' end
  );
  return r;
end;
$$;

/** Přidá ateliér / expedici do kola, které ještě neskončilo. */
create function public.join_round(round uuid, activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x public.enroll_rounds;
  a public.activities;
begin
  select * into x from public.enroll_rounds where id = round;
  select * into a from public.activities where id = activity;
  if x.id is null or a.id is null then
    raise exception 'Kolo nebo nabídka neexistuje.' using errcode = 'no_data_found';
  end if;
  if not public.can_announce(activity) then
    raise exception 'Cizí nabídku můžeš přidat, jen když ji učitel označil jako připravenou.' using errcode = 'insufficient_privilege';
  end if;
  if a.kind <> x.kind then
    raise exception 'Kolo je pro jiný druh nabídky.' using errcode = 'check_violation';
  end if;
  if x.closes_at <= now() then
    raise exception 'Tenhle zápis už skončil.' using errcode = 'check_violation';
  end if;
  if not public.round_free(activity) then
    raise exception 'Nabídka už je v zápisu.' using errcode = 'check_violation';
  end if;
  update public.activities set round_id = round, published = true, announce_ready = false where id = activity;
  if x.opens_at <= now() then
    perform public.notify_students(
      a.allowed_grades, 'zapis',
      case when a.kind::text = 'expedice' then 'Nová expedice v zápisu: ' else 'Nový ateliér v zápisu: ' end || a.title,
      'Zápis končí ' || public.prague_stamp(x.closes_at) || '.',
      '/zapisy?tab=' || case when a.kind::text = 'expedice' then 'expedice' else 'ateliery' end
    );
  end if;
end;
$$;

/** Stáhne nabídku z kola, dokud se zápis neotevřel (pak už ne — kvůli zapsaným). */
create function public.leave_round(activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x public.enroll_rounds;
begin
  if not (public.is_admin() or public.teaches(activity)) then
    raise exception 'Stáhnout ze zápisu může jen vyučující nabídky nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  select r.* into x from public.enroll_rounds r join public.activities a on a.round_id = r.id where a.id = activity;
  if x.id is null then
    return;
  end if;
  if x.opens_at <= now() then
    raise exception 'Zápis už běží, nabídku z něj stáhnout nejde.' using errcode = 'check_violation';
  end if;
  update public.activities set round_id = null, published = false, announce_ready = true where id = activity;
  -- Prázdné kolo zmizí.
  delete from public.enroll_rounds r where r.id = x.id and not exists (select 1 from public.activities a where a.round_id = x.id);
end;
$$;

/** Změna termínu kola (kdo ho vyhlásil, nebo admin), dokud neskončilo. */
create function public.update_round(round uuid, opens timestamptz, closes timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x public.enroll_rounds;
begin
  select * into x from public.enroll_rounds where id = round;
  if x.id is null then
    raise exception 'Kolo neexistuje.' using errcode = 'no_data_found';
  end if;
  if not (public.is_admin() or (public.is_staff() and x.created_by = (select auth.uid()))) then
    raise exception 'Termín mění ten, kdo zápis vyhlásil, nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  if x.closes_at <= now() then
    raise exception 'Tenhle zápis už skončil.' using errcode = 'check_violation';
  end if;
  if opens is null or closes is null or closes <= opens or closes <= now() then
    raise exception 'Zápis musí skončit až po otevření (a v budoucnu).' using errcode = 'check_violation';
  end if;
  if x.opens_at <= now() and opens <> x.opens_at then
    raise exception 'Zápis už běží, změnit jde jen konec.' using errcode = 'check_violation';
  end if;
  update public.enroll_rounds set opens_at = opens, closes_at = closes where id = round;
end;
$$;

alter table public.enroll_rounds enable row level security;
revoke all on public.enroll_rounds from anon, authenticated;
grant select on public.enroll_rounds to authenticated;
create policy "členové vidí zápisová kola" on public.enroll_rounds
  for select to authenticated using (public.is_member());

revoke execute on function public.can_announce, public.round_free, public.announce_round,
  public.join_round, public.leave_round, public.update_round from public, anon;
revoke execute on function public.round_free from authenticated;
grant execute on function public.can_announce, public.announce_round, public.join_round, public.leave_round,
  public.update_round to authenticated;
