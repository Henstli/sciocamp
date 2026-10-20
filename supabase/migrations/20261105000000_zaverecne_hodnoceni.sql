-- Závěrečné hodnocení kurzů, ateliérů a expedic: vyučující (nebo admin) dá
-- každému zapsanému studentovi splněno / nesplněno a slovní hodnocení.
-- Hodnotit jde kdykoli; studenti hodnocení uvidí až po uzavření třídy
-- („Uzavřít a zveřejnit“ — všichni najednou, s oznámením).

create table public.final_reviews (
  activity_id uuid not null references public.activities (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  result text not null check (result in ('splneno', 'nesplneno')),
  feedback text not null default '' check (length(feedback) <= 4000),
  reviewed_by uuid not null default auth.uid() references public.profiles (id),
  reviewed_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);
create index final_reviews_student_idx on public.final_reviews (student_id);

-- Uzavřená třída = hodnocení zveřejněná studentům. Mění se jen přes RPC.
create table public.activity_closures (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  closed_at timestamptz not null default now(),
  closed_by uuid not null references public.profiles (id)
);

create function public.activity_closed(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.activity_closures c where c.activity_id = activity)
$$;

/** Hodnotí se jen kurzy, ateliéry a expedice. */
create function public.gradable_activity(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.kind::text in ('kurz', 'atelier', 'expedice') from public.activities a where a.id = activity), false)
$$;

alter table public.final_reviews enable row level security;
alter table public.activity_closures enable row level security;
revoke all on public.final_reviews from anon, authenticated;
revoke all on public.activity_closures from anon, authenticated;
grant select, insert, update, delete on public.final_reviews to authenticated;
grant select on public.activity_closures to authenticated;

-- Vyučující a admin vidí hodnocení celé školy (statistiky); student jen svoje a až po uzavření.
create policy "kdo vidí závěrečné hodnocení" on public.final_reviews
  for select to authenticated
  using (
    public.is_staff()
    or (student_id = (select auth.uid()) and public.activity_closed(activity_id))
  );

create policy "vyučující třídy hodnotí" on public.final_reviews
  for insert to authenticated
  with check (
    public.manages_class(activity_id)
    and public.gradable_activity(activity_id)
    and exists (select 1 from public.enrollments e where e.activity_id = final_reviews.activity_id and e.student_id = final_reviews.student_id)
  );

create policy "vyučující třídy mění hodnocení" on public.final_reviews
  for update to authenticated
  using (public.manages_class(activity_id))
  with check (public.manages_class(activity_id) and public.gradable_activity(activity_id));

create policy "vyučující třídy maže hodnocení" on public.final_reviews
  for delete to authenticated
  using (public.manages_class(activity_id) and not public.activity_closed(activity_id));

create policy "uzavření vidí členové školy" on public.activity_closures
  for select to authenticated
  using (public.is_member());

-- Kdo a kdy hodnotil: doplní se samo (nejde podvrhnout).
create function public.final_review_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
  new.reviewed_at := now();
  if tg_op = 'UPDATE' then
    new.activity_id := old.activity_id;
    new.student_id := old.student_id;
  end if;
  return new;
end;
$$;
create trigger final_review_stamp before insert or update on public.final_reviews
  for each row execute function public.final_review_stamp();

-- Změna hodnocení v už uzavřené třídě: student dostane oznámení.
create function public.notify_final_review_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t text;
begin
  if not public.activity_closed(new.activity_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.result = old.result and new.feedback = old.feedback then
    return new;
  end if;
  select a.title into t from public.activities a where a.id = new.activity_id;
  perform public.notify(
    array[new.student_id],
    'hodnoceni',
    'Závěrečné hodnocení upraveno: ' || t,
    case new.result when 'splneno' then 'Splněno' else 'Nesplněno' end,
    public.class_href(new.activity_id)
  );
  return new;
end;
$$;
create trigger notify_final_review_change after insert or update on public.final_reviews
  for each row execute function public.notify_final_review_change();

/** Uzavře třídu a zveřejní hodnocení. Všichni zapsaní studenti musí být ohodnocení. */
create function public.close_activity(activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  missing int;
  t text;
  r record;
begin
  if not public.manages_class(activity) then
    raise exception 'Třídu uzavírá jen její vyučující nebo admin.';
  end if;
  if not public.gradable_activity(activity) then
    raise exception 'Závěrečné hodnocení mají jen kurzy, ateliéry a expedice.';
  end if;
  if public.activity_closed(activity) then
    raise exception 'Třída už je uzavřená.';
  end if;
  select count(*) into missing
  from public.enrollments e
  where e.activity_id = activity
    and not exists (select 1 from public.final_reviews f where f.activity_id = activity and f.student_id = e.student_id);
  if missing > 0 then
    raise exception 'Ještě chybí hodnocení u % %.', missing,
      case when missing = 1 then 'studenta' else 'studentů' end;
  end if;
  insert into public.activity_closures (activity_id, closed_by) values (activity, auth.uid());
  select a.title into t from public.activities a where a.id = activity;
  for r in
    select f.student_id, f.result from public.final_reviews f
    join public.enrollments e on e.activity_id = f.activity_id and e.student_id = f.student_id
    where f.activity_id = activity
  loop
    perform public.notify(
      array[r.student_id],
      'hodnoceni',
      'Závěrečné hodnocení: ' || t,
      case r.result when 'splneno' then 'Splněno' else 'Nesplněno' end,
      public.class_href(activity)
    );
  end loop;
end;
$$;

/** Znovu otevře třídu (studenti hodnocení přestanou vidět, dokud se znovu neuzavře). */
create function public.reopen_activity(activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not public.manages_class(activity) then
    raise exception 'Třídu otevírá jen její vyučující nebo admin.';
  end if;
  delete from public.activity_closures c where c.activity_id = activity;
end;
$$;

revoke all on function public.close_activity(uuid) from public, anon;
revoke all on function public.reopen_activity(uuid) from public, anon;
grant execute on function public.close_activity(uuid) to authenticated;
grant execute on function public.reopen_activity(uuid) to authenticated;
