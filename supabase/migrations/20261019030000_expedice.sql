-- Expedice a události, spoluvyučující.
--
-- • Nový druh aktivity „expedice“ (vícedenní výjezd, obvykle po–pá). Všechny
--   expedice jsou ve stejném týdnu a běží souběžně; student může být v jednu
--   dobu jen na jedné expedici (stejně jako v jednom ateliéru).
-- • „ostatni“ zůstává v databázi, v aplikaci se jmenuje „Událost“
--   (třídnická konzultace, seminář…).
-- • Spoluvyučující (activity_teachers): na expedici jedou aspoň dva vyučující,
--   další vyučující může mít i kurz nebo ateliér. Spoluvyučující spravuje třídu
--   stejně jako hlavní vyučující (teaches() je počítá).
--
-- Pozn.: nová hodnota výčtu se v téže transakci nesmí použít jako konstanta,
-- proto se níže porovnává jako text (kind::text).

alter type public.activity_kind add value if not exists 'expedice';

create table public.activity_teachers (
  activity_id uuid not null references public.activities (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  primary key (activity_id, teacher_id)
);
create index activity_teachers_teacher_idx on public.activity_teachers (teacher_id);

comment on table public.activity_teachers is 'Další vyučující aktivity (kromě activities.teacher_id). Expedice jich má aspoň jednoho.';

-- Spoluvyučující musí být učitel nebo admin.
create function public.guard_co_teacher() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.teacher_id and p.role in ('ucitel', 'admin') and not p.blocked) then
    raise exception 'Vyučujícím může být jen učitel nebo admin.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guard_co_teacher before insert or update on public.activity_teachers
  for each row execute function public.guard_co_teacher();

-- Vyučuje přihlášený aktivitu? Hlavní vyučující i spoluvyučující.
create or replace function public.teaches(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (
    exists (select 1 from public.activities a where a.id = activity and a.teacher_id = (select auth.uid()))
    or exists (select 1 from public.activity_teachers t where t.activity_id = activity and t.teacher_id = (select auth.uid()))
  ) and public.is_staff()
$$;

/** Všichni vyučující aktivity (hlavní + spoluvyučující) — pro notifikace. */
create function public.class_teachers(activity uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select array_remove(
    array[(select a.teacher_id from public.activities a where a.id = activity)]
      || coalesce((select array_agg(t.teacher_id) from public.activity_teachers t where t.activity_id = activity), '{}'),
    null
  )
$$;

alter table public.activity_teachers enable row level security;
revoke all on public.activity_teachers from anon, authenticated;
grant select, insert, delete on public.activity_teachers to authenticated;

create policy "členové vidí vyučující" on public.activity_teachers
  for select to authenticated using (public.is_member());
create policy "vyučující a admin mění vyučující" on public.activity_teachers
  for insert to authenticated with check (public.is_admin() or public.teaches(activity_id));
create policy "vyučující a admin odebírají vyučující" on public.activity_teachers
  for delete to authenticated using (public.is_admin() or public.teaches(activity_id));

-- Spoluvyučující upravuje aktivitu (Meet, termíny, rozvrh) stejně jako hlavní vyučující.
-- Smazat ji smí dál jen hlavní vyučující a admin.
create policy "spoluvyučující upravují" on public.activities
  for update to authenticated
  using (public.is_staff() and public.teaches(id))
  with check (public.is_staff() and public.teaches(id));

-- Hlavního vyučujícího mění jen admin (pravidla výše by to spoluvyučujícímu jinak dovolila).
create function public.guard_teacher_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.teacher_id is distinct from old.teacher_id and (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Hlavního vyučujícího může změnit jen admin.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger guard_teacher_change before update of teacher_id on public.activities
  for each row execute function public.guard_teacher_change();

-- ---------------------------------------------------------------------------
-- Jeden ateliér a jedna expedice naráz
-- ---------------------------------------------------------------------------

create or replace function public.guard_one_atelier() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  clash text;
begin
  k := (select kind::text from public.activities where id = new.activity_id);
  if k is null or k not in ('atelier', 'expedice') then
    return new;
  end if;
  select o.title into clash
  from public.enrollments e
  join public.activities o on o.id = e.activity_id
  where e.student_id = new.student_id
    and o.kind::text = k
    and o.id <> new.activity_id
    and public.activity_range(o.id) && public.activity_range(new.activity_id)
  limit 1;
  if clash is not null then
    if k = 'expedice' then
      raise exception 'Student je ve stejné době zapsaný na expedici „%“.', clash using errcode = 'exclusion_violation';
    end if;
    raise exception 'Student je ve stejné době zapsaný v ateliéru „%“.', clash using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create or replace function public.guard_atelier_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  clash text;
begin
  if new.kind::text not in ('atelier', 'expedice') then
    return new;
  end if;
  select o.title into clash
  from public.enrollments mine
  join public.enrollments e on e.student_id = mine.student_id and e.activity_id <> new.id
  join public.activities o on o.id = e.activity_id and o.kind = new.kind
  left join public.blocks b on b.id = new.block_id
  where mine.activity_id = new.id
    and public.activity_range(o.id) && daterange(
      coalesce(new.starts_on, b.starts_on),
      greatest(coalesce(new.ends_on, b.ends_on), coalesce(new.starts_on, b.starts_on)),
      '[]'
    )
  limit 1;
  if clash is not null then
    raise exception 'V nových termínech by se to překrývalo s „%“ u zapsaných studentů.', clash
      using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Odkazy a notifikace podle nových sekcí a všech vyučujících
-- ---------------------------------------------------------------------------

create or replace function public.class_href(activity uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case a.kind::text
      when 'atelier' then '/ateliery/'
      when 'expedice' then '/expedice/'
      when 'ostatni' then '/udalosti/'
      else '/kurzy/'
    end || a.slug
  from public.activities a where a.id = activity
$$;

create or replace function public.notify_post() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(
    public.class_students(new.activity_id) || public.class_teachers(new.activity_id),
    'oznameni',
    public.profile_name(new.author_id) || ' přidal(a) oznámení',
    (select a.title from public.activities a where a.id = new.activity_id) || ': ' || left(new.body, 140),
    public.class_href(new.activity_id)
  );
  return null;
end;
$$;

create or replace function public.notify_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  if new.status <> 'odevzdano' or (tg_op = 'UPDATE' and new.submitted_at is not distinct from old.submitted_at) then
    return null;
  end if;
  select a.title, a.activity_id into t from public.assignments a where a.id = new.assignment_id;
  perform public.notify(
    public.class_teachers(t.activity_id),
    'odevzdani',
    public.profile_name(new.student_id) || ' odevzdal(a) úkol',
    t.title,
    '/ukoly/' || new.assignment_id || '?student=' || new.student_id
  );
  return null;
end;
$$;

create or replace function public.notify_assignment_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  select a.title, a.activity_id into t from public.assignments a where a.id = new.assignment_id;
  if new.author_id = new.student_id then
    perform public.notify(public.class_teachers(t.activity_id), 'komentar',
      public.profile_name(new.author_id) || ' napsal(a) k úkolu', t.title || ': ' || left(new.body, 120),
      '/ukoly/' || new.assignment_id || '?student=' || new.student_id);
  else
    perform public.notify(array[new.student_id], 'komentar',
      public.profile_name(new.author_id) || ' ti napsal(a) k úkolu', t.title || ': ' || left(new.body, 120),
      '/ukoly/' || new.assignment_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.guard_co_teacher, public.guard_teacher_change, public.class_teachers from public, anon, authenticated;
