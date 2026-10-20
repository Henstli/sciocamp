-- Připomínky blížícího se termínu úkolu: 24 hodin před termínem dostane student
-- notifikaci (druh „termin“), pokud práci ještě neodevzdal. Každý úkol jen jednou.
-- Vypnout si to může v Nastavení (profiles.due_reminders). Spouští pg_cron každých 15 minut.

alter table public.profiles add column due_reminders boolean not null default true;
comment on column public.profiles.due_reminders is 'Posílat připomínky blížícího se termínu úkolu.';
grant update (due_reminders) on public.profiles to authenticated;

create table public.due_reminders (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
alter table public.due_reminders enable row level security;
-- Nikdo z aplikace tabulku nečte ani nemění (jen funkce níže).

/** Pošle připomínky úkolů s termínem v příštích 24 hodinách. Vrací počet odeslaných. */
create function public.send_due_reminders() returns integer
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
      and a.due_at > now()
      and a.due_at <= now() + interval '24 hours'
      and p.role = 'student' and not p.blocked and p.due_reminders
      -- hotovo: ohodnoceno (splněno / nesplněno)
      and not exists (
        select 1 from public.reviews r
        where r.assignment_id = a.id and r.student_id = e.student_id and r.result in ('splneno', 'nesplneno')
      )
      -- odevzdáno (a po případném vrácení znovu odevzdáno)
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
revoke execute on function public.send_due_reminders from public, anon, authenticated;

-- Plánovač (v testovací databázi pg_cron není).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('pripominky-terminu', '*/15 * * * *', 'select public.send_due_reminders()');
  end if;
end
$$;
