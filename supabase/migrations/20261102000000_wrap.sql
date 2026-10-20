-- Wrap: roční shrnutí „Tvůj rok v Campu“ (jako Spotify Wrapped).
--
-- Spouští se jednou za školní rok pro všechny najednou (admin nastaví datum,
-- výchozí 20. 6. v 8:00). Po spuštění se každému jednou samo otevře a pak ho
-- 14 dní najde ve svém profilu. Admin si může spuštění vyzkoušet jen na sobě
-- (wrap_trials) a svůj wrap si přehrát kdykoli.
--
-- Data se počítají od 1. 9. daného školního roku do teď. Typ v Campu se určuje
-- porovnáním se zbytkem školy: vyhraje oblast, ve které člověk nejvíc vyčníval.

create table public.wrap_settings (
  id boolean primary key default true check (id),
  launch_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.wrap_settings (id) values (true);
comment on table public.wrap_settings is 'Nastavení wrapu (jeden řádek): kdy se spustí. Mění jen admin přes set_wrap_launch.';

create table public.wrap_trials (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now()
);
comment on table public.wrap_trials is 'Zkouška spuštění wrapu jen pro jednoho admina (14 dní, jde zrušit).';

create table public.wrap_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season smallint not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, season)
);
comment on table public.wrap_views is 'Kdo už wrap daného školního roku viděl (pak se sám neotevře, jen z profilu).';

alter table public.wrap_settings enable row level security;
alter table public.wrap_trials enable row level security;
alter table public.wrap_views enable row level security;
create policy "nastavení wrapu vidí členové" on public.wrap_settings for select to authenticated using (public.is_member());
create policy "svoje zkouška wrapu" on public.wrap_trials for select to authenticated using (user_id = (select auth.uid()));
create policy "svoje zhlédnutí wrapu" on public.wrap_views for select to authenticated using (user_id = (select auth.uid()));
grant select on public.wrap_settings, public.wrap_trials, public.wrap_views to authenticated;

-- ---------------------------------------------------------------------------
-- Termíny
-- ---------------------------------------------------------------------------

/** První den školního roku (1. 9.), do kterého patří daný okamžik. */
create function public.wrap_season_start(moment timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select make_date(
    case when extract(month from (moment at time zone 'Europe/Prague')) >= 9
      then extract(year from (moment at time zone 'Europe/Prague'))::int
      else extract(year from (moment at time zone 'Europe/Prague'))::int - 1 end,
    9, 1)
$$;

/** Kdy se wrap letošního školního roku spustí: nastavené datum, jinak 20. 6. v 8:00. */
create function public.wrap_launch_at() returns timestamptz
language sql stable security definer set search_path = '' as $$
  with s as (select public.wrap_season_start() as d)
  select case
    when w.launch_at is not null and w.launch_at >= (s.d::timestamp at time zone 'Europe/Prague') then w.launch_at
    else (make_date(extract(year from s.d)::int + 1, 6, 20) + time '08:00') at time zone 'Europe/Prague'
  end
  from s left join public.wrap_settings w on w.id
$$;

/** Stav wrapu pro přihlášeného: spuštěný, do kdy, zkouška, už viděný. */
create function public.wrap_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v_launch timestamptz := public.wrap_launch_at();
  v_trial timestamptz;
  v_season int := extract(year from public.wrap_season_start())::int;
  v_active boolean;
  v_until timestamptz;
begin
  if me is null or not public.is_member() then
    return null;
  end if;
  select t.started_at into v_trial from public.wrap_trials t
    where t.user_id = me and t.started_at > now() - interval '14 days';
  if v_trial is not null then
    v_active := true;
    v_until := v_trial + interval '14 days';
  else
    v_active := now() >= v_launch and now() < v_launch + interval '14 days';
    v_until := v_launch + interval '14 days';
  end if;
  return jsonb_build_object(
    'launch_at', v_launch,
    'until', v_until,
    'active', v_active,
    'trial', v_trial is not null,
    'seen', exists (select 1 from public.wrap_views w where w.user_id = me and w.season = v_season),
    'season', v_season
  );
end;
$$;

create function public.mark_wrap_seen() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_member() then
    raise exception 'Nejsi přihlášený.' using errcode = '42501';
  end if;
  insert into public.wrap_views (user_id, season)
  values ((select auth.uid()), extract(year from public.wrap_season_start())::int)
  on conflict do nothing;
end;
$$;

create function public.set_wrap_launch(launch timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Datum spuštění wrapu mění jen admin.' using errcode = '42501';
  end if;
  if launch is null then
    raise exception 'Vyber datum spuštění.' using errcode = '22023';
  end if;
  if public.wrap_season_start(launch) <> public.wrap_season_start() then
    raise exception 'Datum musí patřit do letošního školního roku (1. 9. – 31. 8.).' using errcode = '22023';
  end if;
  update public.wrap_settings set launch_at = launch, updated_by = (select auth.uid()), updated_at = now() where id;
end;
$$;

/** Zkouška spuštění jen na mně: wrap se mi chová, jako by se právě spustil. */
create function public.start_wrap_trial() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Zkoušku spuštění wrapu může pustit jen admin.' using errcode = '42501';
  end if;
  insert into public.wrap_trials (user_id, started_at) values (me, now())
  on conflict (user_id) do update set started_at = now();
  delete from public.wrap_views where user_id = me and season = extract(year from public.wrap_season_start())::int;
end;
$$;

create function public.stop_wrap_trial() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Zkoušku spuštění wrapu může zrušit jen admin.' using errcode = '42501';
  end if;
  delete from public.wrap_trials where user_id = me;
  delete from public.wrap_views where user_id = me and season = extract(year from public.wrap_season_start())::int;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ukazatele pro typ v Campu (pro všechny najednou, ať jde porovnávat)
-- ---------------------------------------------------------------------------

/** Začátek aktivity (vlastní datum, jinak začátek období). */
create function public.activity_starts_on(activity uuid) returns date
language sql stable security definer set search_path = '' as $$
  select coalesce(a.starts_on, b.starts_on)
  from public.activities a left join public.blocks b on b.id = a.block_id
  where a.id = activity
$$;

create function public.wrap_student_values(d_from date) returns table (person uuid, k text, v numeric)
language sql stable security definer set search_path = '' as $$
  with t0 as (
    select d_from::timestamp at time zone 'Europe/Prague' as ts, (now() at time zone 'Europe/Prague')::date as today
  ),
  acts as (
    select e.student_id, a.kind, a.milestones_done, public.activity_starts_on(a.id) as starts_on
    from public.enrollments e join public.activities a on a.id = e.activity_id
  ),
  msgs as (
    select m.author_id, m.created_at from public.messages m where not m.system and m.deleted_at is null
    union all select c.author_id, c.created_at from public.class_messages c where c.deleted_at is null
    union all select t.author_id, t.created_at from public.team_messages t where t.deleted_at is null
  )
  select student_id, 'vypravnik', count(*)::numeric from acts, t0
    where kind = 'expedice' and starts_on between d_from and t0.today group by student_id
  union all
  select student_id, 'tvurce', (count(*) * 2 + coalesce(sum(milestones_done), 0))::numeric from acts, t0
    where kind = 'atelier' and starts_on between d_from and t0.today group by student_id
  union all
  select s.student_id, 'pracant', count(*)::numeric from public.submissions s, t0
    where s.status = 'odevzdano' and s.submitted_at >= t0.ts group by s.student_id
  union all
  select x.user_id, 'hlas', count(*)::numeric from (
    select ps.user_id, ps.created_at from public.proposal_supports ps
    union all select wv.user_id, wv.created_at from public.wish_votes wv
    union all select distinct on (pv.poll_id, pv.user_id) pv.user_id, pv.created_at from public.chat_poll_votes pv
  ) x, t0 where x.created_at >= t0.ts group by x.user_id
  union all
  select x.author_id, 'snilek', count(*)::numeric from (
    select w.author_id, w.created_at from public.wishes w
    union all select p.author_id, p.created_at from public.proposals p
  ) x, t0 where x.created_at >= t0.ts group by x.author_id
  union all
  select m.author_id, 'partak', count(*)::numeric from msgs m, t0 where m.created_at >= t0.ts group by m.author_id
  union all
  select c.student_id, 'zvedavec', count(*)::numeric from public.consultations c, t0
    where c.day between d_from and t0.today group by c.student_id
$$;

create function public.wrap_staff_values(d_from date) returns table (person uuid, k text, v numeric)
language sql stable security definer set search_path = '' as $$
  with t0 as (
    select d_from::timestamp at time zone 'Europe/Prague' as ts, (now() at time zone 'Europe/Prague')::date as today
  ),
  led as (
    select x.teacher_id, a.kind, public.activity_starts_on(a.id) as starts_on
    from (
      select a.id as activity_id, a.teacher_id from public.activities a
      union select t.activity_id, t.teacher_id from public.activity_teachers t
    ) x join public.activities a on a.id = x.activity_id
  )
  select r.reviewed_by, 'mentor', count(*)::numeric from public.reviews r, t0
    where r.reviewed_at >= t0.ts group by r.reviewed_by
  union all
  select teacher_id, 'pruvodce', count(*)::numeric from led, t0
    where kind = 'expedice' and starts_on between d_from and t0.today group by teacher_id
  union all
  select teacher_id, 'mistr', count(*)::numeric from led, t0
    where kind = 'atelier' and starts_on between d_from and t0.today group by teacher_id
  union all
  select c.teacher_id, 'konzultant', count(*)::numeric from public.consultations c, t0
    where c.day between d_from and t0.today group by c.teacher_id
  union all
  select a.created_by, 'architekt', count(*)::numeric from public.assignments a, t0
    where a.created_at >= t0.ts group by a.created_by
  union all
  select x.who, 'hybatel', count(*)::numeric from (
    select w.closed_by as who, w.closed_at as at from public.wishes w where w.status = 'vypsano'
    union all select p.resolved_by, p.resolved_at from public.proposals p where p.resolved_by is not null
    union all select p.author_id, p.created_at from public.proposals p
    union all select ps.user_id, ps.created_at from public.proposal_supports ps
  ) x, t0 where x.who is not null and x.at >= t0.ts group by x.who
  union all
  select x.author_id, 'spojka', count(*)::numeric from (
    select m.author_id, m.created_at from public.messages m where not m.system and m.deleted_at is null
    union all select c.author_id, c.created_at from public.class_messages c where c.deleted_at is null
    union all select p.author_id, p.created_at from public.posts p
  ) x, t0 where x.created_at >= t0.ts group by x.author_id
$$;

/**
 * Typ v Campu: oblast, ve které člověk nejvíc předběhl ostatní (studenty,
 * nebo vyučující a adminy). beat = podíl ostatních s menší hodnotou.
 * Kdo nikde nepředběhl aspoň polovinu, dostane výchozí typ.
 */
create function public.wrap_type(person uuid, d_from date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  v_staff boolean := (select p.role in ('ucitel', 'admin') from public.profiles p where p.id = person);
  v_group int;
  v_res jsonb;
  v_order text[] := case when v_staff
    then array['pruvodce', 'mistr', 'konzultant', 'mentor', 'hybatel', 'architekt', 'spojka']
    else array['vypravnik', 'tvurce', 'snilek', 'hlas', 'zvedavec', 'pracant', 'partak'] end;
begin
  select count(*) into v_group from public.profiles p
    where not p.blocked and (case when v_staff then p.role in ('ucitel', 'admin') else p.role = 'student' end);
  with vals as (
    select x.person, x.k, x.v from public.wrap_student_values(d_from) x where not v_staff
    union all select x.person, x.k, x.v from public.wrap_staff_values(d_from) x where v_staff
  ),
  members as (
    select vals.* from vals join public.profiles p on p.id = vals.person
    where not p.blocked and (case when v_staff then p.role in ('ucitel', 'admin') else p.role = 'student' end)
  ),
  mine as (select m.k, m.v from members m where m.person = person and m.v > 0),
  scored as (
    select mine.k, mine.v,
      (v_group - 1 - (select count(*) from members o where o.k = mine.k and o.person <> person and o.v >= mine.v))::numeric
        / greatest(v_group - 1, 1) as beat
    from mine
  )
  select jsonb_build_object('key', s.k, 'value', s.v, 'beat', round(s.beat, 2))
    into v_res
  from scored s
  where s.beat >= 0.5
  order by s.beat desc, array_position(v_order, s.k)
  limit 1;
  return coalesce(v_res, jsonb_build_object('key', case when v_staff then 'opora' else 'tabornik' end, 'value', 0, 'beat', 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- Data wrapu pro přihlášeného
-- ---------------------------------------------------------------------------

create function public.wrap_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v_role public.app_role;
  v_name text;
  v_from date := public.wrap_season_start();
  v_ts timestamptz := public.wrap_season_start()::timestamp at time zone 'Europe/Prague';
  v_today date := (now() at time zone 'Europe/Prague')::date;
  v_state jsonb := public.wrap_state();
  v_mine jsonb;
  v_school jsonb;
begin
  if me is null or not public.is_member() then
    raise exception 'Nejsi přihlášený.' using errcode = '42501';
  end if;
  if not public.is_admin() and not coalesce((v_state ->> 'active')::boolean, false) then
    raise exception 'Wrap ještě není spuštěný.' using errcode = '42501';
  end if;
  select p.role, p.full_name into v_role, v_name from public.profiles p where p.id = me;

  -- Škola v číslech (stejné pro všechny)
  v_school := jsonb_build_object(
    'handed', (select count(*) from public.submissions s where s.status = 'odevzdano' and s.submitted_at >= v_ts),
    'reviews', (select count(*) from public.reviews r where r.reviewed_at >= v_ts),
    'messages', (select count(*) from public.messages m where not m.system and m.created_at >= v_ts)
      + (select count(*) from public.class_messages c where c.created_at >= v_ts)
      + (select count(*) from public.team_messages t where t.created_at >= v_ts),
    'expeditions', (select count(*) from public.activities a
      where a.kind = 'expedice' and public.activity_starts_on(a.id) between v_from and v_today),
    'approved', (select count(*) from public.proposals p where p.status = 'schvaleno' and p.resolved_at >= v_ts),
    'wishes', (select count(*) from public.wishes w where w.status = 'vypsano' and w.closed_at >= v_ts),
    'top_atelier', (select a.title from public.activities a join public.enrollments e on e.activity_id = a.id
      where a.kind = 'atelier' and public.activity_starts_on(a.id) between v_from and v_today
      group by a.id, a.title order by count(*) desc, a.title limit 1)
  );

  if v_role = 'student' then
    with acts as (
      select a.id, a.kind, a.title, a.teacher_id, a.milestones_done,
        lower(public.activity_range(a.id)) as starts_on, upper(public.activity_range(a.id)) as ends_after
      from public.enrollments e join public.activities a on a.id = e.activity_id
      where e.student_id = me
    ),
    cur as (select * from acts where starts_on between v_from and v_today),
    handed as (
      select s.submitted_at, a.due_at from public.submissions s join public.assignments a on a.id = s.assignment_id
      where s.student_id = me and s.status = 'odevzdano' and s.submitted_at >= v_ts
    ),
    rev as (
      select r.result, r.points, a.max_points from public.reviews r join public.assignments a on a.id = r.assignment_id
      where r.student_id = me and r.reviewed_at >= v_ts
    )
    select jsonb_build_object(
      'handed', (select count(*) from handed),
      'on_time', (select count(*) from handed where due_at is not null and submitted_at <= due_at),
      'with_due', (select count(*) from handed where due_at is not null),
      'top_weekday', (select extract(isodow from submitted_at at time zone 'Europe/Prague')::int from handed
        group by 1 order by count(*) desc, 1 limit 1),
      'points', (select coalesce(sum(points), 0) from rev where result = 'splneno'),
      'full_points', (select count(*) from rev where result = 'splneno' and max_points is not null and points = max_points),
      'passed', (select count(*) from rev where result = 'splneno'),
      'reviewed', (select count(*) from rev where result in ('splneno', 'nesplneno')),
      'courses', (select count(*) from cur where kind = 'kurz'),
      'ateliers', (select count(*) from cur where kind = 'atelier'),
      'teachers', (select count(distinct teacher_id) from cur where kind in ('kurz', 'atelier')),
      'milestones', (select coalesce(sum(milestones_done), 0) from cur where kind = 'atelier'),
      'expeditions', coalesce((select jsonb_agg(title order by starts_on) from cur where kind = 'expedice'), '[]'::jsonb),
      'expedition_days', (select coalesce(sum(least(ends_after, v_today + 1) - starts_on), 0) from cur where kind = 'expedice'),
      'votes', (select count(*) from public.proposal_supports ps where ps.user_id = me and ps.created_at >= v_ts),
      'wish_votes', (select count(*) from public.wish_votes wv where wv.user_id = me and wv.created_at >= v_ts),
      'wishes', (select count(*) from public.wishes w where w.author_id = me and w.created_at >= v_ts),
      'wishes_fulfilled', coalesce((select jsonb_agg(w.title order by w.closed_at) from public.wishes w
        where w.author_id = me and w.status = 'vypsano' and w.closed_at >= v_ts), '[]'::jsonb),
      'proposals', (select count(*) from public.proposals p where p.author_id = me and p.created_at >= v_ts),
      'polls', (select count(*) from public.chat_polls cp where cp.author_id = me and cp.created_at >= v_ts),
      'consultations', (select count(*) from public.consultations c where c.student_id = me and c.day between v_from and v_today),
      'consultation_top', (select p.full_name from public.consultations c join public.profiles p on p.id = c.teacher_id
        where c.student_id = me and c.day between v_from and v_today group by p.id, p.full_name
        order by count(*) desc, p.full_name limit 1)
    ) into v_mine;
  else
    with led as (
      select a.id, a.kind, a.title from public.activities a
      where (a.teacher_id = me or exists (select 1 from public.activity_teachers t where t.activity_id = a.id and t.teacher_id = me))
        and a.kind in ('kurz', 'atelier', 'expedice')
        and public.activity_starts_on(a.id) between v_from and v_today
    ),
    created as (
      select a.kind, a.activity_id from public.assignments a where a.created_by = me and a.created_at >= v_ts
    ),
    rev as (
      select r.reviewed_at, r.feedback, s.submitted_at
      from public.reviews r left join public.submissions s on s.assignment_id = r.assignment_id and s.student_id = r.student_id
      where r.reviewed_by = me and r.reviewed_at >= v_ts
    ),
    lively as (
      select l.id, l.title,
        (select count(*) from public.class_messages c where c.activity_id = l.id and c.created_at >= v_ts) as chat,
        (select count(*) from public.posts p where p.activity_id = l.id and p.created_at >= v_ts) as posts
      from led l
    )
    select jsonb_build_object(
      'courses', (select count(*) from led where kind = 'kurz'),
      'ateliers', (select count(*) from led where kind = 'atelier'),
      'expeditions', (select count(*) from led where kind = 'expedice'),
      'students', (select count(distinct e.student_id) from public.enrollments e join led on led.id = e.activity_id),
      'tasks', (select count(*) from created where kind = 'ukol'),
      'materials', (select count(*) from created where kind <> 'ukol'),
      'top_class', (select a.title from created c join public.activities a on a.id = c.activity_id
        group by a.id, a.title order by count(*) desc, a.title limit 1),
      'reviews', (select count(*) from rev),
      'review_days', (select round(avg(extract(epoch from (reviewed_at - submitted_at)) / 86400)::numeric, 1)
        from rev where submitted_at is not null and reviewed_at >= submitted_at),
      'feedback', (select count(*) from rev where length(trim(coalesce(feedback, ''))) > 0),
      'lively_title', (select title from lively where chat + posts > 0 order by chat + posts desc, title limit 1),
      'lively_chat', (select chat from lively where chat + posts > 0 order by chat + posts desc, title limit 1),
      'lively_posts', (select posts from lively where chat + posts > 0 order by chat + posts desc, title limit 1),
      'posts', (select count(*) from public.posts p where p.author_id = me and p.created_at >= v_ts),
      'consultations', (select count(*) from public.consultations c where c.teacher_id = me and c.day between v_from and v_today),
      'wishes_fulfilled', coalesce((select jsonb_agg(w.title order by w.closed_at) from public.wishes w
        where w.closed_by = me and w.status = 'vypsano' and w.closed_at >= v_ts), '[]'::jsonb),
      'proposals_resolved', (select count(*) from public.proposals p where p.resolved_by = me and p.resolved_at >= v_ts),
      'votes', (select count(*) from public.proposal_supports ps where ps.user_id = me and ps.created_at >= v_ts),
      'polls', (select count(*) from public.chat_polls cp where cp.author_id = me and cp.created_at >= v_ts)
    ) into v_mine;
  end if;

  -- Společné: zprávy, lidé, reakce, GIFy, odznaky, typ
  with pairs as (
    select o.user_id as other, count(m.id) as n
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id and not c.is_group and not c.is_school
    join public.conversation_members o on o.conversation_id = c.id and o.user_id <> me
    join public.messages m on m.conversation_id = c.id and not m.system and m.deleted_at is null and m.created_at >= v_ts
    where cm.user_id = me
    group by o.user_id
  )
  select v_mine || jsonb_build_object(
    'messages', (select count(*) from public.messages m where m.author_id = me and not m.system and m.deleted_at is null and m.created_at >= v_ts)
      + (select count(*) from public.class_messages c where c.author_id = me and c.deleted_at is null and c.created_at >= v_ts)
      + (select count(*) from public.team_messages t where t.author_id = me and t.deleted_at is null and t.created_at >= v_ts),
    'gifs', (select count(*) from public.messages m where m.author_id = me and m.created_at >= v_ts
      and m.body ~ '^https://media[0-9]*\.giphy\.com/media/')
      + (select count(*) from public.class_messages c where c.author_id = me and c.created_at >= v_ts
      and c.body ~ '^https://media[0-9]*\.giphy\.com/media/')
      + (select count(*) from public.team_messages t where t.author_id = me and t.created_at >= v_ts
      and t.body ~ '^https://media[0-9]*\.giphy\.com/media/'),
    'top_emoji', (select r.emoji from public.chat_reactions r where r.user_id = me and r.created_at >= v_ts
      group by r.emoji order by count(*) desc, r.emoji limit 1),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', x.other, 'name', x.full_name, 'count', x.n) order by x.n desc, x.full_name)
      from (select pairs.other, pairs.n, p.full_name from pairs join public.profiles p on p.id = pairs.other
        order by pairs.n desc, p.full_name limit 3) x), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('key', ub.badge, 'tier', ub.tier) order by ub.earned_at)
      from public.user_badges ub where ub.user_id = me and ub.earned_at >= v_ts), '[]'::jsonb),
    'type', public.wrap_type(me, v_from)
  ) into v_mine
  from (select 1) one;

  return jsonb_build_object(
    'name', v_name,
    'role', v_role,
    'season', extract(year from v_from)::int,
    'from', v_from,
    'mine', v_mine,
    'school', v_school
  );
end;
$$;

revoke execute on function public.wrap_launch_at, public.wrap_state, public.mark_wrap_seen, public.set_wrap_launch,
  public.start_wrap_trial, public.stop_wrap_trial, public.activity_starts_on, public.wrap_student_values,
  public.wrap_staff_values, public.wrap_type, public.wrap_data from public, anon;
revoke execute on function public.activity_starts_on, public.wrap_student_values, public.wrap_staff_values, public.wrap_type
  from authenticated;
grant execute on function public.wrap_launch_at, public.wrap_state, public.mark_wrap_seen, public.set_wrap_launch,
  public.start_wrap_trial, public.stop_wrap_trial, public.wrap_data to authenticated;
