-- Plánované úkoly a materiály: vyučující je připraví dopředu a nastaví, kdy se
-- zveřejní (assignments.publish_at). Do té doby je studenti nevidí, nemůžou
-- odevzdávat ani číst přiložené soubory; oznámení přijde až při zveřejnění
-- (pg_cron každých 5 minut, publish_scheduled_assignments).

alter table public.assignments
  add column publish_at timestamptz,
  add column announced_at timestamptz;
comment on column public.assignments.publish_at is 'Kdy se úkol zveřejní studentům (null = hned).';
comment on column public.assignments.announced_at is 'Kdy studenti dostali oznámení o novém úkolu.';
-- Stávající úkoly (publish_at = null) cron nikdy nevezme, takže je není třeba doplňovat.

/** Je úkol už zveřejněný studentům? */
create function public.assignment_published(assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.publish_at is null or a.publish_at <= now() from public.assignments a where a.id = assignment), false)
$$;

-- Student vidí úkol až od zveřejnění (vyučující a admin vždy). Omezující politika
-- se přidává k těm stávajícím.
create policy "naplánované úkoly studenti nevidí" on public.assignments
  as restrictive for select to authenticated
  using (publish_at is null or publish_at <= now() or public.is_admin() or public.teaches(activity_id));

-- Student pracuje jen se zveřejněnými úkoly (odevzdání, komentáře, soubory, týmy…).
create or replace function public.in_assignment_class(assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member()
    and public.is_enrolled(public.assignment_activity(assignment))
    and public.assignment_published(assignment)
$$;

-- Oznámení o novém úkolu: hned, nebo až při zveřejnění.
create or replace function public.notify_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.publish_at is not null and new.publish_at > now() then
    return null;
  end if;
  perform public.notify(
    public.class_students(new.activity_id),
    new.kind::text,
    case when new.kind = 'ukol' then 'Nový úkol: ' else 'Nový materiál: ' end || new.title,
    (select a.title from public.activities a where a.id = new.activity_id),
    '/ukoly/' || new.id
  );
  update public.assignments set announced_at = now() where id = new.id;
  return null;
end;
$$;

/** Zveřejní naplánované úkoly, kterým nastal čas: pošle oznámení. Vrací počet. */
create function public.publish_scheduled_assignments() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  n integer := 0;
begin
  for a in
    select x.* from public.assignments x
    where x.announced_at is null and x.publish_at is not null and x.publish_at <= now()
    for update skip locked
  loop
    perform public.notify(
      public.class_students(a.activity_id),
      a.kind::text,
      case when a.kind = 'ukol' then 'Nový úkol: ' else 'Nový materiál: ' end || a.title,
      (select t.title from public.activities t where t.id = a.activity_id),
      '/ukoly/' || a.id
    );
    update public.assignments set announced_at = now() where id = a.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.publish_scheduled_assignments from public, anon, authenticated;
revoke execute on function public.assignment_published from public, anon;

/** Vyučující naplánovaný úkol zveřejní hned (oznámení přijde studentům teď). */
create function public.publish_assignment_now(assignment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.manages_assignment(assignment) then
    raise exception 'Zveřejnit úkol může jen vyučující třídy.' using errcode = 'insufficient_privilege';
  end if;
  update public.assignments set publish_at = now() where id = assignment and publish_at > now();
  perform public.publish_scheduled_assignments();
end;
$$;
revoke execute on function public.publish_assignment_now from public, anon;
grant execute on function public.publish_assignment_now to authenticated;

-- Připomínky termínu jen u zveřejněných úkolů.
create or replace function public.send_due_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  sent integer;
begin
  with due as (
    select a.id as assignment_id, a.title, a.due_at, act.title as activity_title, e.student_id
    from public.assignments a
    join public.activities act on act.id = a.activity_id
    join public.enrollments e on e.activity_id = a.activity_id
    join public.profiles p on p.id = e.student_id
    where a.kind = 'ukol'
      and (a.publish_at is null or a.publish_at <= now())
      and a.due_at > now()
      and a.due_at <= now() + interval '24 hours'
      and p.role = 'student' and not p.blocked and p.due_reminders
      and not exists (
        select 1 from public.reviews r
        where r.assignment_id = a.id and r.student_id = e.student_id and r.result in ('splneno', 'nesplneno')
      )
      and not exists (
        select 1 from public.submissions s
        left join public.reviews r on r.assignment_id = s.assignment_id and r.student_id = s.student_id
        where s.assignment_id = a.id and s.student_id = e.student_id and s.status = 'odevzdano'
          and (r.assignment_id is null or s.submitted_at > r.reviewed_at)
      )
  ),
  fresh as (
    insert into public.due_reminders (assignment_id, student_id)
    select assignment_id, student_id from due
    on conflict do nothing
    returning assignment_id, student_id
  ),
  notes as (
    insert into public.notifications (user_id, kind, title, body, href)
    select d.student_id, 'termin', 'Blíží se termín: ' || d.title,
      d.activity_title || ' · odevzdat do ' ||
        to_char(d.due_at at time zone 'Europe/Prague', 'FMDD. FMMM. HH24:MI'),
      '/ukoly/' || d.assignment_id
    from due d join fresh f on f.assignment_id = d.assignment_id and f.student_id = d.student_id
    returning 1
  )
  select count(*) into sent from notes;
  return sent;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('zverejneni-ukolu', '*/5 * * * *', 'select public.publish_scheduled_assignments()');
  end if;
end
$$;
