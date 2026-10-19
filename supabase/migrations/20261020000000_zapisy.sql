-- Zápisy do kurzů, ateliérů a expedic.
--
-- Kurzy: admin založí období, učitelé do něj zadají kurzy (studenti je zatím
-- nevidí) a každý učitel u období potvrdí „Mám hotovo“ (block_ready). Admin pak
-- období zveřejní (publish_block) a nastaví termín zápisu.
-- Ateliéry a expedice: termín zápisu a zveřejnění nastavuje jejich učitel
-- (activities.enroll_opens_at / enroll_closes_at / published), kdykoli.
--
-- Student se zapisuje sám přes RPC (enroll_self, leave_self, join_waitlist,
-- leave_waitlist). Databáze hlídá kapacitu (zámek řádku aktivity), časové
-- křížení (schedule_clash), ročníky a termín zápisu. Uvolněné místo dostane
-- první z čekací řady, se kterým se nic nekříží (promote_waitlist).

-- ---------------------------------------------------------------------------
-- Období: termín zápisu a zveřejnění
-- ---------------------------------------------------------------------------

alter table public.blocks rename column enrollment_until to enroll_closes_at;
alter table public.blocks
  add column enroll_opens_at timestamptz,
  add column published_at timestamptz,
  add constraint block_enroll_window check (enroll_opens_at is null or enroll_closes_at is null or enroll_closes_at > enroll_opens_at);
comment on column public.blocks.published_at is 'Kdy admin zveřejnil kurzy období v zápisu. Null = příprava (studenti kurzy nevidí).';

-- Dosavadní období už běží.
update public.blocks set published_at = now();

create table public.block_ready (
  block_id uuid not null references public.blocks (id) on delete cascade,
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  ready_at timestamptz not null default now(),
  primary key (block_id, teacher_id)
);
comment on table public.block_ready is 'Učitel potvrdil, že má kurzy v období připravené.';

-- ---------------------------------------------------------------------------
-- Aktivity: zveřejnění a vlastní termín zápisu (ateliéry, expedice)
-- ---------------------------------------------------------------------------

alter table public.activities
  add column published boolean not null default true,
  add column enroll_opens_at timestamptz,
  add column enroll_closes_at timestamptz,
  add constraint activity_enroll_window check (enroll_opens_at is null or enroll_closes_at is null or enroll_closes_at > enroll_opens_at);
-- Dosavadní aktivity zůstanou vidět, nové jsou do zveřejnění rozpracované.
alter table public.activities alter column published set default false;
comment on column public.activities.published is 'Vidí ji všichni studenti (nabídka v zápisu). Rozpracovanou vidí jen učitelé a zapsaní.';
comment on column public.activities.enroll_opens_at is 'Vlastní termín zápisu (ateliér, expedice). Kurzy berou termín z období.';

drop policy "členové vidí aktivity" on public.activities;
create policy "členové vidí zveřejněné aktivity" on public.activities
  for select to authenticated
  using (public.is_staff() or (public.is_member() and (published or public.is_enrolled(id))));

-- ---------------------------------------------------------------------------
-- Čekací řada
-- ---------------------------------------------------------------------------

create table public.waitlist (
  activity_id uuid not null references public.activities (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (activity_id, student_id)
);
create index waitlist_student_idx on public.waitlist (student_id);

-- ---------------------------------------------------------------------------
-- Pomocné funkce
-- ---------------------------------------------------------------------------

/** Termín zápisu aktivity, nebo null (zápis není vyhlášený). */
create function public.enroll_window(activity uuid) returns tstzrange
language sql stable security definer set search_path = '' as $$
  select case
    when not a.published then null
    when a.kind = 'kurz' then
      case when b.published_at is not null and b.enroll_opens_at is not null and b.enroll_closes_at is not null
        then tstzrange(b.enroll_opens_at, b.enroll_closes_at, '[)') end
    when a.enroll_opens_at is not null and a.enroll_closes_at is not null
      then tstzrange(a.enroll_opens_at, a.enroll_closes_at, '[)')
  end
  from public.activities a
  left join public.blocks b on b.id = a.block_id
  where a.id = activity
$$;

/**
 * S čím se studentovi aktivita kříží (název), jinak null:
 * stejný den a čas v rozvrhu ve společných týdnech, nebo dva ateliéry / dvě
 * expedice ve stejné době.
 */
create function public.schedule_clash(student uuid, activity uuid) returns text
language sql stable security definer set search_path = '' as $$
  select o.title
  from public.enrollments e
  join public.activities o on o.id = e.activity_id
  join public.activities n on n.id = activity
  where e.student_id = student
    and o.id <> activity
    and public.activity_range(o.id) && public.activity_range(activity)
    and (
      (o.kind = n.kind and n.kind::text in ('atelier', 'expedice'))
      or exists (
        select 1
        from public.activity_slots s1
        join public.activity_slots s2
          on s2.activity_id = activity and s2.weekday = s1.weekday
         and s1.starts_at < s2.ends_at and s2.starts_at < s1.ends_at
        where s1.activity_id = o.id
      )
    )
  order by o.title
  limit 1
$$;

/** Přihlášený student, který se smí zapisovat; jinak výjimka. */
create function public.enroll_student() returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = (select auth.uid());
  if p.id is null or p.blocked or p.role <> 'student' then
    raise exception 'Zapisovat se můžou jen studenti.' using errcode = 'insufficient_privilege';
  end if;
  return p;
end;
$$;

/** Společné kontroly zápisu (zámek aktivity kvůli kapacitě). Vrací aktivitu. */
create function public.enroll_guard(activity uuid, student public.profiles) returns public.activities
language plpgsql security definer set search_path = '' as $$
declare
  a public.activities;
  w tstzrange;
  clash text;
begin
  -- Zámek: dva lidé ve stejnou chvíli nepřekročí kapacitu.
  select * into a from public.activities where id = activity for update;
  if a.id is null then
    raise exception 'Aktivita neexistuje.' using errcode = 'no_data_found';
  end if;
  w := public.enroll_window(activity);
  if w is null or not (now() <@ w) then
    raise exception 'Zápis teď neprobíhá.' using errcode = 'check_violation';
  end if;
  if a.allowed_grades is not null and (student.grade is null or not student.grade = any (a.allowed_grades)) then
    raise exception 'Tahle nabídka není pro tvůj ročník.' using errcode = 'check_violation';
  end if;
  clash := public.schedule_clash(student.id, activity);
  if clash is not null then
    raise exception 'Kříží se s „%“, kde už jsi zapsaný(á).', clash using errcode = 'exclusion_violation';
  end if;
  return a;
end;
$$;

create function public.is_full(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a.capacity is not null and (select count(*) from public.enrollments e where e.activity_id = a.id) >= a.capacity
  from public.activities a where a.id = activity
$$;

-- ---------------------------------------------------------------------------
-- Zápis studenta
-- ---------------------------------------------------------------------------

create function public.enroll_self(activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.enroll_student();
begin
  if exists (select 1 from public.enrollments where activity_id = activity and student_id = me.id) then
    return;
  end if;
  perform public.enroll_guard(activity, me);
  if public.is_full(activity) then
    raise exception 'Je plno. Můžeš se přidat na čekací řadu.' using errcode = 'check_violation';
  end if;
  insert into public.enrollments (activity_id, student_id) values (activity, me.id);
end;
$$;

create function public.leave_self(activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.enroll_student();
  w tstzrange := public.enroll_window(activity);
begin
  if w is null or not (now() <@ w) then
    raise exception 'Zápis už skončil. Odhlásit tě může vyučující.' using errcode = 'check_violation';
  end if;
  delete from public.enrollments where activity_id = activity and student_id = me.id;
end;
$$;

create function public.join_waitlist(activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := public.enroll_student();
begin
  if exists (select 1 from public.enrollments where activity_id = activity and student_id = me.id) then
    raise exception 'Už jsi zapsaný(á).' using errcode = 'check_violation';
  end if;
  perform public.enroll_guard(activity, me);
  if not public.is_full(activity) then
    raise exception 'Místo je volné, rovnou se zapiš.' using errcode = 'check_violation';
  end if;
  insert into public.waitlist (activity_id, student_id) values (activity, me.id) on conflict do nothing;
end;
$$;

create function public.leave_waitlist(activity uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.waitlist where activity_id = activity and student_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Posun z čekací řady
-- ---------------------------------------------------------------------------

create function public.promote_waitlist(activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.activities;
  w record;
begin
  select * into a from public.activities where id = activity for update;
  if a.id is null or upper(public.activity_range(activity)) <= current_date then
    return;
  end if;
  for w in
    select student_id from public.waitlist where activity_id = activity order by created_at, student_id
  loop
    exit when public.is_full(activity);
    -- Kdo se mezitím zapsal na něco, co se kříží, čeká dál.
    continue when public.schedule_clash(w.student_id, activity) is not null;
    begin
      insert into public.enrollments (activity_id, student_id) values (activity, w.student_id);
      perform public.notify(
        array[w.student_id], 'zapis', 'Uvolnilo se místo — jsi zapsaný(á)',
        a.title, public.class_href(activity)
      );
    exception when others then
      -- Nejde zapsat (např. jiná kontrola) — zkusíme dalšího.
      null;
    end;
  end loop;
end;
$$;

create function public.after_enrollment_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.promote_waitlist(old.activity_id);
  return null;
end;
$$;
create trigger promote_waitlist after delete on public.enrollments
  for each row execute function public.after_enrollment_delete();

-- Zapsaný student už nečeká.
create function public.after_enrollment_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.waitlist where activity_id = new.activity_id and student_id = new.student_id;
  return null;
end;
$$;
create trigger leave_waitlist_on_enroll after insert on public.enrollments
  for each row execute function public.after_enrollment_insert();

create function public.after_capacity_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.promote_waitlist(new.id);
  return null;
end;
$$;
create trigger promote_on_capacity after update of capacity on public.activities
  for each row when (new.capacity is distinct from old.capacity)
  execute function public.after_capacity_change();

-- ---------------------------------------------------------------------------
-- Přehled pro stránku Zápisy (obsazenost vidí všichni, jména ne)
-- ---------------------------------------------------------------------------

create function public.enrollment_overview()
returns table (activity_id uuid, enrolled integer, waiting integer, my_position integer)
language sql stable security definer set search_path = '' as $$
  select
    a.id,
    (select count(*)::int from public.enrollments e where e.activity_id = a.id),
    (select count(*)::int from public.waitlist w where w.activity_id = a.id),
    (select x.pos::int from (
        select w.student_id, row_number() over (order by w.created_at, w.student_id) as pos
        from public.waitlist w where w.activity_id = a.id
      ) x where x.student_id = (select auth.uid()))
  from public.activities a
  where public.is_member() and (a.published or public.is_staff())
$$;

-- ---------------------------------------------------------------------------
-- Zveřejnění období (admin) a ateliérů / expedic (učitel)
-- ---------------------------------------------------------------------------

create function public.prague_stamp(t timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(t at time zone 'Europe/Prague', 'FMDD. FMMM. "v" HH24:MI')
$$;

/** Rozešle studentům (podle ročníků aktivity) oznámení. */
create function public.notify_students(grades smallint[], kind text, title text, body text, href text) returns void
language sql security definer set search_path = '' as $$
  select public.notify(
    coalesce(array_agg(p.id), '{}'), kind, title, body, href
  )
  from public.profiles p
  where p.role = 'student' and not p.blocked
    and (grades is null or p.grade = any (grades))
$$;

create function public.publish_block(block uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.blocks;
  first_time boolean;
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
  if first_time then
    perform public.notify_students(
      null, 'zapis', 'Zápis do kurzů: ' || b.name,
      'Otevře se ' || public.prague_stamp(b.enroll_opens_at) || ', skončí ' || public.prague_stamp(b.enroll_closes_at) || '.',
      '/zapisy'
    );
  end if;
end;
$$;

-- Ateliér nebo expedice vyhlášená do zápisu → oznámení studentům.
create function public.notify_activity_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind::text in ('atelier', 'expedice') and new.published and new.enroll_opens_at is not null
     and (not old.published or old.enroll_opens_at is null) then
    perform public.notify_students(
      new.allowed_grades,
      'zapis',
      case when new.kind::text = 'expedice' then 'Zápis na expedici: ' else 'Zápis do ateliéru: ' end || new.title,
      'Otevře se ' || public.prague_stamp(new.enroll_opens_at) || '.',
      '/zapisy?tab=' || case when new.kind::text = 'expedice' then 'expedice' else 'ateliery' end
    );
  end if;
  return null;
end;
$$;
create trigger notify_activity_published after update of published, enroll_opens_at on public.activities
  for each row execute function public.notify_activity_published();

-- ---------------------------------------------------------------------------
-- RLS a oprávnění
-- ---------------------------------------------------------------------------

alter table public.block_ready enable row level security;
alter table public.waitlist enable row level security;
revoke all on public.block_ready, public.waitlist from anon, authenticated;
grant select, insert, delete on public.block_ready to authenticated;
grant select, delete on public.waitlist to authenticated;

create policy "učitelé vidí, kdo je hotový" on public.block_ready
  for select to authenticated using (public.is_staff());
create policy "učitel potvrdí za sebe" on public.block_ready
  for insert to authenticated with check (public.is_staff() and teacher_id = (select auth.uid()));
create policy "učitel ruší za sebe, admin cokoli" on public.block_ready
  for delete to authenticated using (teacher_id = (select auth.uid()) or public.is_admin());

create policy "student vidí svou čekačku, vyučující celou" on public.waitlist
  for select to authenticated
  using (student_id = (select auth.uid()) or public.is_admin() or public.teaches(activity_id));
create policy "vyučující a admin odebírají z čekačky" on public.waitlist
  for delete to authenticated
  using (public.is_admin() or public.teaches(activity_id));

revoke execute on function public.enroll_window, public.schedule_clash, public.enroll_student, public.enroll_guard,
  public.is_full, public.enroll_self, public.leave_self, public.join_waitlist, public.leave_waitlist,
  public.promote_waitlist, public.after_enrollment_delete, public.after_enrollment_insert, public.after_capacity_change,
  public.enrollment_overview, public.prague_stamp, public.notify_students, public.publish_block,
  public.notify_activity_published
  from public, anon;
revoke execute on function public.schedule_clash, public.enroll_student, public.enroll_guard, public.promote_waitlist,
  public.after_enrollment_delete, public.after_enrollment_insert, public.after_capacity_change,
  public.notify_students, public.notify_activity_published
  from authenticated;
grant execute on function public.enroll_window, public.is_full, public.enroll_self,
  public.leave_self, public.join_waitlist, public.leave_waitlist, public.enrollment_overview,
  public.prague_stamp, public.publish_block
  to authenticated;
