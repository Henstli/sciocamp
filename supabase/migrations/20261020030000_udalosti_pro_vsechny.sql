-- Události pro všechny: „všichni studenti“ a „všichni učitelé a admini“.
--
-- Místo jednorázového zapsání má aktivita příznaky. Databáze do ní zapíše
-- všechny současné studenty (podle povolených ročníků) a vyučující (jako další
-- vyučující) a průběžně i ty, které admin založí později.

alter table public.activities
  add column for_all_students boolean not null default false,
  add column for_all_staff boolean not null default false;
comment on column public.activities.for_all_students is 'Zapsaní jsou všichni studenti (podle povolených ročníků), i nově založení.';
comment on column public.activities.for_all_staff is 'Všichni učitelé a admini jsou další vyučující, i nově založení.';

/** Doplní do aktivity všechny studenty / vyučující podle příznaků. */
create function public.fill_for_all(activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.activities;
begin
  select * into a from public.activities where id = activity;
  if a.id is null then
    return;
  end if;
  if a.for_all_students then
    insert into public.enrollments (activity_id, student_id)
    select a.id, p.id from public.profiles p
    where p.role = 'student' and not p.blocked
      and (a.allowed_grades is null or p.grade = any (a.allowed_grades))
    on conflict do nothing;
  end if;
  if a.for_all_staff then
    insert into public.activity_teachers (activity_id, teacher_id)
    select a.id, p.id from public.profiles p
    where p.role in ('ucitel', 'admin') and not p.blocked and p.id <> a.teacher_id
    on conflict do nothing;
  end if;
end;
$$;

create function public.after_for_all_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.for_all_students or new.for_all_staff then
    perform public.fill_for_all(new.id);
  end if;
  return null;
end;
$$;
create trigger fill_for_all after insert or update of for_all_students, for_all_staff, allowed_grades, teacher_id on public.activities
  for each row execute function public.after_for_all_change();

-- Nový (nebo odblokovaný, nebo přeřazený) člověk se doplní do neskončených akcí „pro všechny“.
create function public.after_profile_for_all() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.blocked then
    return null;
  end if;
  if new.role = 'student' then
    insert into public.enrollments (activity_id, student_id)
    select a.id, new.id from public.activities a
    where a.for_all_students
      and (a.allowed_grades is null or new.grade = any (a.allowed_grades))
      and (upper(public.activity_range(a.id)) is null or upper(public.activity_range(a.id)) > current_date)
    on conflict do nothing;
  elsif new.role in ('ucitel', 'admin') then
    insert into public.activity_teachers (activity_id, teacher_id)
    select a.id, new.id from public.activities a
    where a.for_all_staff and a.teacher_id <> new.id
      and (upper(public.activity_range(a.id)) is null or upper(public.activity_range(a.id)) > current_date)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger fill_for_all_profile after insert or update of role, grade, blocked on public.profiles
  for each row execute function public.after_profile_for_all();

revoke execute on function public.fill_for_all, public.after_for_all_change, public.after_profile_for_all
  from public, anon, authenticated;
