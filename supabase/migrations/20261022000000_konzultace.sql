-- Konzultace: studenti si zapisují 15minutové bloky u učitelů a adminů
-- v pátek 8:30–12:00, nejvýš dva týdny dopředu. Sousední bloky se spojí do
-- jedné konzultace. Učitel si nastaví pravidelně nedostupné bloky a jednotlivé
-- pátky (nebo jejich bloky) ruší dopředu. Kdo je na expedici, v tom týdnu
-- konzultace nemá. Zápis hlídá kolize s jinými konzultacemi i s rozvrhem.
-- Účastníci (student, učitel, pozvaní) k ní můžou přidat odkaz na Meet a
-- pozvat další lidi.

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  day date not null check (extract(isodow from day) = 5),
  starts_at time not null,
  ends_at time not null,
  meet_url text check (meet_url is null or meet_url ~ '^https://meet\.google\.com/[a-z0-9-]+$'),
  created_at timestamptz not null default now(),
  check (starts_at >= '08:30' and ends_at <= '12:00' and ends_at > starts_at),
  check (extract(minute from starts_at)::int % 15 = 0 and extract(minute from ends_at)::int % 15 = 0
         and extract(second from starts_at) = 0 and extract(second from ends_at) = 0)
);
create index consultations_teacher_idx on public.consultations (teacher_id, day);
create index consultations_student_idx on public.consultations (student_id, day);
comment on table public.consultations is 'Páteční konzultace (spojené 15min bloky jednoho studenta u jednoho učitele).';

create table public.consultation_guests (
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (consultation_id, user_id)
);
create index consultation_guests_user_idx on public.consultation_guests (user_id);

/** Pravidelně nedostupné bloky učitele (každý pátek). */
create table public.consultation_rules (
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  slot time not null check (slot >= '08:30' and slot < '12:00' and extract(minute from slot)::int % 15 = 0),
  primary key (teacher_id, slot)
);

/** Jednorázově zrušené bloky (slot) nebo celý pátek (slot = null). */
create table public.consultation_blocks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  day date not null check (extract(isodow from day) = 5),
  slot time check (slot is null or (slot >= '08:30' and slot < '12:00' and extract(minute from slot)::int % 15 = 0))
);
create unique index consultation_blocks_uniq on public.consultation_blocks (teacher_id, day, coalesce(slot, '00:00'));

alter table public.consultations enable row level security;
alter table public.consultation_guests enable row level security;
alter table public.consultation_rules enable row level security;
alter table public.consultation_blocks enable row level security;

/** Je přihlášený účastníkem konzultace (učitel, student, pozvaný)? */
create function public.in_consultation(consultation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consultations c
    where c.id = consultation and (select auth.uid()) in (c.teacher_id, c.student_id)
  ) or exists (
    select 1 from public.consultation_guests g where g.consultation_id = consultation and g.user_id = (select auth.uid())
  )
$$;

create policy "konzultace: vidí účastníci a admin" on public.consultations for select to authenticated
  using (public.in_consultation(id) or public.is_admin());
create policy "hosté konzultace: vidí účastníci a admin" on public.consultation_guests for select to authenticated
  using (public.in_consultation(consultation_id) or public.is_admin());
grant select on public.consultations, public.consultation_guests to authenticated;

-- Nedostupnost učitelů vidí všichni (kvůli tabulce volných bloků); mění ji každý učitel sám sobě.
create policy "pravidla konzultací: čtou členové" on public.consultation_rules for select to authenticated
  using (public.is_member());
create policy "pravidla konzultací: učitel sám sobě" on public.consultation_rules for insert to authenticated
  with check (teacher_id = (select auth.uid()) and public.is_staff());
create policy "pravidla konzultací: učitel maže svoje" on public.consultation_rules for delete to authenticated
  using (teacher_id = (select auth.uid()));
create policy "zrušené bloky: čtou členové" on public.consultation_blocks for select to authenticated
  using (public.is_member());
create policy "zrušené bloky: učitel sám sobě" on public.consultation_blocks for insert to authenticated
  with check (teacher_id = (select auth.uid()) and public.is_staff());
create policy "zrušené bloky: učitel maže svoje" on public.consultation_blocks for delete to authenticated
  using (teacher_id = (select auth.uid()));
grant select, insert, delete on public.consultation_rules, public.consultation_blocks to authenticated;

/** Dnešek v Praze. */
create function public.prague_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Prague')::date
$$;

/**
 * Proč nemá člověk v daný pátek a čas volno (null = má volno): jiná
 * konzultace, expedice v tom týdnu, nebo hodina v rozvrhu.
 */
create function public.consultation_busy(person uuid, d date, s time, e time, ignore uuid default null) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'jinou konzultaci ' || to_char(c.starts_at, 'FMHH24:MI') || '–' || to_char(c.ends_at, 'FMHH24:MI')
     from public.consultations c
     where c.day = d and c.starts_at < e and c.ends_at > s and c.id is distinct from ignore
       and (person in (c.teacher_id, c.student_id)
            or exists (select 1 from public.consultation_guests g where g.consultation_id = c.id and g.user_id = person))
     limit 1),
    (select 'expedici ' || a.title
     from public.activities a
     where a.kind = 'expedice'
       and public.activity_range(a.id) && daterange(d - 4, d, '[]')
       and (a.teacher_id = person
            or exists (select 1 from public.activity_teachers t where t.activity_id = a.id and t.teacher_id = person)
            or exists (select 1 from public.enrollments en where en.activity_id = a.id and en.student_id = person))
     limit 1),
    (select a.title || ' ' || to_char(sl.starts_at, 'FMHH24:MI') || '–' || to_char(sl.ends_at, 'FMHH24:MI')
     from public.activity_slots sl
     join public.activities a on a.id = sl.activity_id
     where sl.weekday = 5 and sl.starts_at < e and sl.ends_at > s
       and public.activity_range(a.id) @> d
       -- V týdnu expedic běžná výuka neprobíhá.
       and not exists (select 1 from public.activities x where x.kind = 'expedice' and public.activity_range(x.id) @> d)
       and (a.teacher_id = person
            or exists (select 1 from public.activity_teachers t where t.activity_id = a.id and t.teacher_id = person)
            or exists (select 1 from public.enrollments en where en.activity_id = a.id and en.student_id = person))
     limit 1)
  )
$$;

/** Nabízí učitel v daný pátek a čas konzultace? (pravidelná a jednorázová nedostupnost) */
create function public.consultation_offered(teacher uuid, d date, s time, e time) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.consultation_rules r where r.teacher_id = teacher and r.slot >= s and r.slot < e)
     and not exists (
       select 1 from public.consultation_blocks b
       where b.teacher_id = teacher and b.day = d and (b.slot is null or (b.slot >= s and b.slot < e))
     )
$$;

/** Text „pá 23. 10. 9:00–9:30“ pro oznámení. */
create function public.consultation_label(d date, s time, e time) returns text
language sql immutable set search_path = '' as $$
  select 'pá ' || extract(day from d)::int || '. ' || extract(month from d)::int || '. '
    || to_char(s, 'FMHH24:MI') || '–' || to_char(e, 'FMHH24:MI')
$$;

/**
 * Student se zapíše u učitele na blok s–e. Navazující konzultace u stejného
 * učitele se spojí do jedné. Vrací id konzultace.
 */
create function public.book_consultation(teacher uuid, d date, s time, e time) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.profiles;
  why text;
  left_c public.consultations;
  right_c public.consultations;
  result uuid;
  new_s time := s;
  new_e time := e;
begin
  if public.my_role() is distinct from 'student' then
    raise exception 'Na konzultace se zapisují studenti.' using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.profiles where id = teacher;
  if t.id is null or t.blocked or t.role not in ('ucitel', 'admin') then
    raise exception 'Tento vyučující konzultace nenabízí.' using errcode = 'check_violation';
  end if;
  if extract(isodow from d) <> 5 or s < '08:30' or e > '12:00' or e <= s
     or extract(minute from s)::int % 15 <> 0 or extract(minute from e)::int % 15 <> 0 then
    raise exception 'Konzultace jsou v pátek 8:30–12:00 po 15 minutách.' using errcode = 'check_violation';
  end if;
  if d > public.prague_today() + 14 then
    raise exception 'Zapsat se jde nejvýš dva týdny dopředu.' using errcode = 'check_violation';
  end if;
  if (d + s) at time zone 'Europe/Prague' <= now() then
    raise exception 'Tenhle čas už proběhl.' using errcode = 'check_violation';
  end if;

  -- Zámky proti souběžnému zápisu stejného učitele / studenta.
  perform pg_advisory_xact_lock(hashtextextended('konzultace:' || teacher || ':' || d, 0));
  perform pg_advisory_xact_lock(hashtextextended('konzultace:' || me || ':' || d, 0));

  if not public.consultation_offered(teacher, d, s, e) then
    raise exception 'Vyučující v tuto dobu konzultace nenabízí.' using errcode = 'check_violation';
  end if;
  why := public.consultation_busy(teacher, d, s, e);
  if why is not null then
    raise exception 'Vyučující má v tu dobu %.', why using errcode = 'check_violation';
  end if;
  why := public.consultation_busy(me, d, s, e);
  if why is not null then
    raise exception 'Kříží se ti to: máš %.', why using errcode = 'check_violation';
  end if;

  -- Spojení s navazujícími konzultacemi u stejného učitele.
  select * into left_c from public.consultations
  where teacher_id = teacher and student_id = me and day = d and ends_at = s;
  select * into right_c from public.consultations
  where teacher_id = teacher and student_id = me and day = d and starts_at = e;
  if left_c.id is not null then new_s := left_c.starts_at; end if;
  if right_c.id is not null then new_e := right_c.ends_at; end if;

  if left_c.id is not null then
    if right_c.id is not null then
      insert into public.consultation_guests (consultation_id, user_id, invited_by)
      select left_c.id, g.user_id, g.invited_by from public.consultation_guests g where g.consultation_id = right_c.id
      on conflict do nothing;
      update public.consultations set meet_url = coalesce(left_c.meet_url, right_c.meet_url) where id = left_c.id;
      delete from public.consultations where id = right_c.id;
    end if;
    update public.consultations set starts_at = new_s, ends_at = new_e where id = left_c.id;
    result := left_c.id;
  elsif right_c.id is not null then
    update public.consultations set starts_at = new_s, ends_at = new_e where id = right_c.id;
    result := right_c.id;
  else
    insert into public.consultations (teacher_id, student_id, day, starts_at, ends_at)
    values (teacher, me, d, s, e) returning id into result;
  end if;

  perform public.notify(
    array[teacher], 'konzultace',
    'Konzultace: ' || public.profile_name(me),
    public.consultation_label(d, new_s, new_e), '/konzultace'
  );
  return result;
end;
$$;

/** Zrušení konzultace: student, učitel nebo admin. Oznámení ostatním účastníkům. */
create function public.cancel_consultation(consultation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.consultations;
  people uuid[];
begin
  select * into c from public.consultations where id = consultation;
  if c.id is null then
    raise exception 'Konzultace už neexistuje.' using errcode = 'check_violation';
  end if;
  if auth.uid() not in (c.teacher_id, c.student_id) and not public.is_admin() then
    raise exception 'Zrušit ji může student, vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  select array[c.teacher_id, c.student_id] || coalesce(array_agg(g.user_id), '{}') into people
  from public.consultation_guests g where g.consultation_id = c.id;
  delete from public.consultations where id = c.id;
  perform public.notify(
    people, 'konzultace', 'Konzultace zrušena',
    public.consultation_label(c.day, c.starts_at, c.ends_at) || ' · zrušil(a) ' || public.profile_name(auth.uid()), '/konzultace'
  );
end;
$$;

/** Účastník pozve dalšího studenta nebo učitele (musí mít v tu dobu volno). */
create function public.invite_to_consultation(consultation uuid, person uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.consultations;
  p public.profiles;
  why text;
begin
  select * into c from public.consultations where id = consultation;
  if c.id is null or not public.in_consultation(consultation) then
    raise exception 'Zvát můžou jen účastníci konzultace.' using errcode = 'insufficient_privilege';
  end if;
  select * into p from public.profiles where id = person;
  if p.id is null or p.blocked then
    raise exception 'Tohoto člověka pozvat nejde.' using errcode = 'check_violation';
  end if;
  if person in (c.teacher_id, c.student_id)
     or exists (select 1 from public.consultation_guests g where g.consultation_id = c.id and g.user_id = person) then
    raise exception 'Už je pozvaný(á).' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('konzultace:' || person || ':' || c.day, 0));
  why := public.consultation_busy(person, c.day, c.starts_at, c.ends_at, c.id);
  if why is not null then
    raise exception '% má v tu dobu %.', p.full_name, why using errcode = 'check_violation';
  end if;
  insert into public.consultation_guests (consultation_id, user_id, invited_by) values (c.id, person, auth.uid());
  perform public.notify(
    array[person], 'konzultace', 'Pozvánka na konzultaci',
    public.consultation_label(c.day, c.starts_at, c.ends_at) || ' · zve ' || public.profile_name(auth.uid()), '/konzultace'
  );
end;
$$;

/** Odebrání pozvaného: sám sebe, nebo ho odebere student / vyučující konzultace. */
create function public.remove_consultation_guest(consultation uuid, person uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.consultations;
begin
  select * into c from public.consultations where id = consultation;
  if c.id is null or (auth.uid() <> person and auth.uid() not in (c.teacher_id, c.student_id) and not public.is_admin()) then
    raise exception 'Odebrat může jen student nebo vyučující konzultace.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.consultation_guests where consultation_id = c.id and user_id = person;
end;
$$;

/** Odkaz na Meet ke konzultaci (kdokoli z účastníků); null = odebrat. */
create function public.set_consultation_meet(consultation uuid, url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.in_consultation(consultation) then
    raise exception 'Meet přidávají účastníci konzultace.' using errcode = 'insufficient_privilege';
  end if;
  update public.consultations set meet_url = nullif(btrim(url), '') where id = consultation;
end;
$$;

/**
 * Obsazené časy učitelů pro tabulku volných bloků (bez jmen studentů):
 * jejich konzultace a konzultace, kam jsou pozvaní.
 */
create function public.consultation_board(d_from date, d_to date)
returns table (teacher_id uuid, day date, starts_at time, ends_at time)
language sql stable security definer set search_path = '' as $$
  select c.teacher_id, c.day, c.starts_at, c.ends_at
  from public.consultations c
  where c.day between d_from and d_to and public.is_member()
  union all
  select g.user_id, c.day, c.starts_at, c.ends_at
  from public.consultation_guests g
  join public.consultations c on c.id = g.consultation_id
  join public.profiles p on p.id = g.user_id and p.role in ('ucitel', 'admin')
  where c.day between d_from and d_to and public.is_member()
$$;

revoke execute on function public.in_consultation, public.prague_today, public.consultation_busy,
  public.consultation_offered, public.consultation_label, public.book_consultation, public.cancel_consultation,
  public.invite_to_consultation, public.remove_consultation_guest, public.set_consultation_meet,
  public.consultation_board from public, anon;
revoke execute on function public.consultation_busy, public.consultation_offered, public.consultation_label
  from authenticated;
grant execute on function public.in_consultation, public.prague_today, public.book_consultation,
  public.cancel_consultation, public.invite_to_consultation, public.remove_consultation_guest,
  public.set_consultation_meet, public.consultation_board to authenticated;
