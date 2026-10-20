-- Odznaky (jen studenti). Úrovně a názvy v badge_levels, získané v user_badges.
-- Počítá je refresh_my_badges() při otevření aplikace: spočítá hodnoty
-- (badge_values), přidá nové odznaky a zvýší úrovně (nikdy nesníží), pošle
-- oznámení a vrátí ještě neviděné (pro animaci). Na kartě profilu si student
-- vystaví až 3 (profiles.shown_badges); ostatní vidí jen ty.

create table public.badge_levels (
  badge text primary key,
  name text not null,
  t1 integer not null check (t1 > 0),
  t2 integer check (t2 > t1),
  t3 integer check (t3 > t2)
);

insert into public.badge_levels (badge, name, t1, t2, t3) values
  ('vitej', 'Vítej v Campu', 1, null, null),
  ('prvni-krok', 'První krok', 1, null, null),
  ('zakladatel', 'Zakladatel', 1, null, null),
  ('pracant', 'Pracant', 15, 100, 300),
  ('vcas', 'Včas', 15, 75, 200),
  ('spolehlivy', 'Spolehlivý', 1, null, null),
  ('druhy-dech', 'Druhý dech', 5, null, null),
  ('plny-pocet', 'Plný počet', 5, 40, 120),
  ('tymovy-hrac', 'Týmový hráč', 5, null, null),
  ('vypravnik', 'Výpravník', 1, 10, 25),
  ('tvurce', 'Tvůrce', 2, 7, 14),
  ('zvedavec', 'Zvědavec', 6, null, null),
  ('hlas-skoly', 'Hlas školy', 10, 50, 150),
  ('iniciator', 'Iniciátor', 1, null, null),
  ('menim-skolu', 'Měním školu', 1, null, null),
  ('snilek', 'Snílek', 1, null, null),
  ('zvidavy', 'Zvídavý', 5, null, null),
  ('anketar', 'Anketář', 20, null, null),
  ('na-vlne', 'Na vlně', 4, null, null);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null references public.badge_levels (badge) on delete cascade,
  tier smallint not null default 1 check (tier between 1 and 3),
  earned_at timestamptz not null default now(),
  -- Kdy student viděl animaci (null = ukáže se při příštím otevření)
  seen_at timestamptz,
  primary key (user_id, badge)
);

alter table public.profiles add column shown_badges text[] not null default '{}'
  check (cardinality(shown_badges) <= 3);

-- Kdy byl úkol vrácený k doplnění (pro „Druhý dech“; hodnocení má jen poslední stav).
create table public.review_returns (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  returned_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

create function public.track_review_return() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.result = 'vraceno' then
    insert into public.review_returns (assignment_id, student_id) values (new.assignment_id, new.student_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger track_review_return after insert or update of result on public.reviews
  for each row execute function public.track_review_return();

alter table public.badge_levels enable row level security;
alter table public.user_badges enable row level security;
alter table public.review_returns enable row level security;
grant select on public.badge_levels to authenticated;
grant select on public.user_badges to authenticated;
create policy "úrovně odznaků vidí členové" on public.badge_levels for select to authenticated using (public.is_member());
create policy "svoje odznaky" on public.user_badges for select to authenticated using (user_id = (select auth.uid()));

/** Konec aktivity (ateliér/expedice má vlastní, kurz podle období). */
create function public.activity_ends_on(activity uuid) returns date
language sql stable security definer set search_path = '' as $$
  select coalesce(a.ends_on, b.ends_on)
  from public.activities a left join public.blocks b on b.id = a.block_id
  where a.id = activity
$$;

/** Hodnoty, ze kterých se počítají odznaky jednoho studenta. */
create function public.badge_values(person uuid) returns table (badge text, value integer)
language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'Europe/Prague')::date as d),
  handed as (
    select s.assignment_id, s.submitted_at, a.due_at
    from public.submissions s join public.assignments a on a.id = s.assignment_id
    where s.student_id = person and s.status = 'odevzdano' and s.submitted_at is not null
  ),
  good as (
    select r.assignment_id, r.points, a.max_points, a.team_work
    from public.reviews r join public.assignments a on a.id = r.assignment_id
    where r.student_id = person and r.result = 'splneno'
  ),
  done_activities as (
    select a.kind, a.teacher_id, public.activity_ends_on(a.id) as ends_on
    from public.enrollments e join public.activities a on a.id = e.activity_id
    where e.student_id = person
  ),
  -- Úkoly ze zapsaných aktivit (zveřejněné, s termínem) pro Spolehlivého a Na vlně
  tasks as (
    select a.id, a.due_at,
      (select r.result from public.reviews r where r.assignment_id = a.id and r.student_id = person) as result,
      (select s.submitted_at from public.submissions s
        where s.assignment_id = a.id and s.student_id = person and s.status = 'odevzdano') as submitted_at
    from public.assignments a join public.enrollments e on e.activity_id = a.activity_id and e.student_id = person
    where a.kind = 'ukol' and a.due_at is not null and (a.publish_at is null or a.publish_at <= now())
  ),
  semesters as (
    select
      case when extract(month from t.due_at at time zone 'Europe/Prague') >= 9
        then extract(year from t.due_at at time zone 'Europe/Prague')::int
        else extract(year from t.due_at at time zone 'Europe/Prague')::int - 1 end as school_year,
      case when extract(month from t.due_at at time zone 'Europe/Prague') >= 9
        or extract(month from t.due_at at time zone 'Europe/Prague') = 1 then 1 else 2 end as half,
      t.result
    from tasks t
  ),
  semester_ok as (
    select school_year, half
    from semesters
    group by school_year, half
    having count(*) >= 3 and bool_and(result is not distinct from 'splneno')
      and (case when half = 1 then make_date(school_year + 1, 1, 31) else make_date(school_year + 1, 6, 30) end) < (select d from today)
  ),
  weeks as (
    select date_trunc('week', t.due_at at time zone 'Europe/Prague') as wk,
      bool_and(t.submitted_at is not null and t.submitted_at <= t.due_at) as ok
    from tasks t
    where t.due_at < now()
    group by 1
  ),
  runs as (
    select ok, row_number() over (order by wk) - row_number() over (partition by ok order by wk) as grp from weeks
  )
  select 'pracant', (select count(*)::int from handed)
  union all select 'prvni-krok', (select count(*)::int from handed)
  union all select 'vcas', (select count(*)::int from handed where due_at is not null and submitted_at <= due_at)
  union all select 'plny-pocet', (select count(*)::int from good where max_points is not null and points = max_points)
  union all select 'tymovy-hrac', (select count(*)::int from good where team_work)
  union all select 'druhy-dech', (select count(*)::int from good g
    where exists (select 1 from public.review_returns x where x.assignment_id = g.assignment_id and x.student_id = person))
  union all select 'vypravnik', (select count(*)::int from done_activities where kind = 'expedice' and ends_on < (select d from today))
  union all select 'tvurce', (select count(*)::int from done_activities where kind = 'atelier' and ends_on < (select d from today))
  union all select 'zvedavec', (select count(distinct teacher_id)::int from done_activities where kind = 'kurz')
  union all select 'hlas-skoly', (select count(*)::int from public.proposal_supports ps where ps.user_id = person)
  union all select 'iniciator', (select count(*)::int from public.proposals p where p.author_id = person and p.reached_at is not null)
  union all select 'menim-skolu', (select count(*)::int from public.proposals p where p.author_id = person and p.status = 'schvaleno')
  union all select 'snilek', (select count(*)::int from public.wishes w where w.author_id = person and w.status = 'vypsano')
  union all select 'zvidavy', (select count(*)::int from public.consultations c where c.student_id = person and c.day < (select d from today))
  union all select 'vitej', (select case when p.avatar_path is not null and length(trim(coalesce(p.bio, ''))) > 0 then 1 else 0 end
    from public.profiles p where p.id = person)
  -- Zakladatel: kdo aplikaci používal v jejím prvním školním roce (do 30. 6. 2027).
  union all select 'zakladatel', case when (select d from today) <= date '2027-06-30' then 1 else 0 end
  union all select 'spolehlivy', (select count(*)::int from semester_ok)
  union all select 'anketar', (select coalesce(max(n), 0)::int from (
    select count(distinct v.user_id) as n from public.chat_polls cp
    join public.chat_poll_votes v on v.poll_id = cp.id
    where cp.author_id = person group by cp.id) x)
  union all select 'na-vlne', (select coalesce(max(n), 0)::int from (select count(*) as n from runs where ok group by grp) y)
$$;

/** Úroveň podle hodnoty (0 = zatím nezískáno). */
create function public.badge_tier(l public.badge_levels, value integer) returns smallint
language sql immutable set search_path = '' as $$
  select (case
    when l.t3 is not null and value >= l.t3 then 3
    when l.t2 is not null and value >= l.t2 then 2
    when value >= l.t1 then 1
    else 0 end)::smallint
$$;

/**
 * Přepočítá odznaky přihlášeného studenta: přidá nové, zvýší úrovně (nikdy
 * nesníží), pošle oznámení a vrátí odznaky, jejichž animaci ještě neviděl.
 */
create function public.refresh_my_badges()
returns table (badge text, tier smallint, earned_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
begin
  if me is null or not public.is_member() then
    return;
  end if;
  if public.my_role() = 'student' then
    with calc as (
      select v.badge, public.badge_tier(l, v.value) as tier, l.name, l.t2
      from public.badge_values(me) v join public.badge_levels l on l.badge = v.badge
    ),
    changed as (
      insert into public.user_badges as ub (user_id, badge, tier, earned_at, seen_at)
      select me, c.badge, c.tier, now(), null from calc c where c.tier > 0
      on conflict (user_id, badge) do update
        set tier = excluded.tier, earned_at = now(), seen_at = null
        where ub.tier < excluded.tier
      returning ub.badge, ub.tier
    )
    insert into public.notifications (user_id, kind, title, body, href)
    select me, 'odznak',
      'Nový odznak: ' || c.name || case when c.t2 is not null then ' ' || (array['I', 'II', 'III'])[ch.tier] else '' end,
      'Podívej se do svých odznaků v profilu.',
      '/profil#odznaky'
    from changed ch join calc c on c.badge = ch.badge;
  end if;
  return query
    select ub.badge, ub.tier, ub.earned_at from public.user_badges ub
    where ub.user_id = me and ub.seen_at is null
    order by ub.earned_at, ub.badge;
end;
$$;

/** Moje odznaky s hodnotou postupu (i nezískané) pro sbírku v profilu. */
create function public.my_badges()
returns table (badge text, value integer, tier smallint, earned_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.badge, v.value, coalesce(ub.tier, 0)::smallint, ub.earned_at
  from public.badge_values((select auth.uid())) v
  left join public.user_badges ub on ub.user_id = (select auth.uid()) and ub.badge = v.badge
  where public.is_member() and public.my_role() = 'student'
$$;

/** Animace odznaků je viděná. */
create function public.mark_badges_seen(badges text[]) returns void
language sql security definer set search_path = '' as $$
  update public.user_badges set seen_at = now()
  where user_id = (select auth.uid()) and badge = any (badges) and seen_at is null
$$;

/** Vystavené odznaky na kartě profilu (jen získané, nejvýš 3, v daném pořadí). */
create function public.set_shown_badges(badges text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  clean text[];
begin
  if me is null or not public.is_member() then
    raise exception 'Nejsi přihlášený.' using errcode = '42501';
  end if;
  select coalesce(array_agg(b order by n), '{}') into clean
  from (select distinct on (b) b, n from unnest(badges) with ordinality as x(b, n) order by b, n) d;
  if cardinality(clean) > 3 then
    raise exception 'Vystavit jde nejvýš 3 odznaky.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(clean) b where not exists (
    select 1 from public.user_badges ub where ub.user_id = me and ub.badge = b)) then
    raise exception 'Vystavit jde jen získaný odznak.' using errcode = '22023';
  end if;
  update public.profiles set shown_badges = clean where id = me;
end;
$$;

/** Vystavené odznaky člověka (vidí všichni ve škole). */
create function public.shown_badges_of(person uuid)
returns table (badge text, tier smallint)
language sql stable security definer set search_path = '' as $$
  select ub.badge, ub.tier
  from public.profiles p
  cross join lateral unnest(p.shown_badges) with ordinality as s(b, n)
  join public.user_badges ub on ub.user_id = p.id and ub.badge = s.b
  where p.id = person and public.is_member()
  order by s.n
$$;

revoke execute on function public.track_review_return, public.badge_values, public.badge_tier, public.activity_ends_on
  from public, anon, authenticated;
revoke execute on function public.refresh_my_badges, public.my_badges, public.mark_badges_seen, public.set_shown_badges, public.shown_badges_of
  from public, anon;
grant execute on function public.refresh_my_badges, public.my_badges, public.mark_badges_seen, public.set_shown_badges, public.shown_badges_of
  to authenticated;
