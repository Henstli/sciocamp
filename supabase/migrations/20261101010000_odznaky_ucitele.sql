-- Odznaky i pro vyučující a adminy: společné odznaky (badge_levels.audience = 'all')
-- a vlastní učitelské (Mentor, Průvodce, Mistr dílny, Konzultant).

alter table public.badge_levels add column audience text not null default 'student'
  check (audience in ('student', 'staff', 'all'));
update public.badge_levels set audience = 'all'
  where badge in ('vitej', 'zakladatel', 'hlas-skoly', 'iniciator', 'menim-skolu', 'snilek', 'anketar');

insert into public.badge_levels (badge, name, t1, t2, t3, audience) values
  ('mentor', 'Mentor', 50, 300, 1000, 'staff'),
  ('pruvodce', 'Průvodce', 1, 5, 15, 'staff'),
  ('mistr-dilny', 'Mistr dílny', 1, 5, 15, 'staff'),
  ('konzultant', 'Konzultant', 10, 50, 150, 'staff');

/** Odznaky, které člověk podle role může získat. */
create function public.badge_for_me(audience text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when public.my_role() = 'student' then audience in ('student', 'all') else audience in ('staff', 'all') end
$$;

create or replace function public.badge_values(person uuid) returns table (badge text, value integer)
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
  -- Vyučující a admini
  union all select 'mentor', (select count(*)::int from public.reviews r where r.reviewed_by = person)
  union all select 'pruvodce', (select count(*)::int from public.activities a
    where a.kind = 'expedice' and public.activity_ends_on(a.id) < (select d from today)
      and (a.teacher_id = person or exists (select 1 from public.activity_teachers t where t.activity_id = a.id and t.teacher_id = person)))
  union all select 'mistr-dilny', (select count(*)::int from public.activities a
    where a.kind = 'atelier' and public.activity_ends_on(a.id) < (select d from today)
      and (a.teacher_id = person or exists (select 1 from public.activity_teachers t where t.activity_id = a.id and t.teacher_id = person)))
  union all select 'konzultant', (select count(*)::int from public.consultations c where c.teacher_id = person and c.day < (select d from today))
$$;


create or replace function public.refresh_my_badges()
returns table (badge text, tier smallint, earned_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
begin
  if me is null or not public.is_member() then
    return;
  end if;
  with calc as (
    select v.badge, public.badge_tier(l, v.value) as tier, l.name, l.t2
    from public.badge_values(me) v join public.badge_levels l on l.badge = v.badge
    where public.badge_for_me(l.audience)
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
  return query
    select ub.badge, ub.tier, ub.earned_at from public.user_badges ub
    where ub.user_id = me and ub.seen_at is null
    order by ub.earned_at, ub.badge;
end;
$$;

create or replace function public.my_badges()
returns table (badge text, value integer, tier smallint, earned_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.badge, v.value, coalesce(ub.tier, 0)::smallint, ub.earned_at
  from public.badge_values((select auth.uid())) v
  join public.badge_levels l on l.badge = v.badge
  left join public.user_badges ub on ub.user_id = (select auth.uid()) and ub.badge = v.badge
  where public.is_member() and public.badge_for_me(l.audience)
$$;

revoke execute on function public.badge_for_me from public, anon, authenticated;
revoke execute on function public.badge_values from public, anon, authenticated;
