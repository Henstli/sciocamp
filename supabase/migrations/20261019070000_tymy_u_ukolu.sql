-- Týmy patří úkolu (ne třídě). Při zadání týmového úkolu vyučující buď týmy
-- rozdělí sám, nebo nechá studenty, ať se rozdělí sami (s max. velikostí týmu).
-- Hodnocení: celému týmu najednou, nebo jednotlivci (reviews.individual) —
-- individuální hodnocení pozdější hodnocení týmu nepřepíše.
--
-- Předchozí verze (týmy ve třídě) byla nasazená jen chvíli a žádné týmy v ní
-- nevznikly, proto se tabulky zakládají znovu.

drop policy if exists "týmy: tým a vyučující nahrávají" on storage.objects;
drop policy if exists "týmy: tým a vyučující čtou" on storage.objects;
drop table public.team_messages;
drop table public.team_members;
drop table public.teams;
drop function public.team_activity(uuid);
drop function public.prepare_team_member();

alter table public.assignments
  add column team_mode text not null default 'teacher' check (team_mode in ('teacher', 'students')),
  add column team_max_size integer check (team_max_size between 2 and 20);
comment on column public.assignments.team_mode is 'teacher = týmy rozdělí vyučující, students = studenti se rozdělí sami.';

alter table public.reviews add column individual boolean not null default false;
comment on column public.reviews.individual is 'Hodnocení jen tohoto člena týmu (hodnocení týmu ho nepřepíše).';

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index teams_assignment_idx on public.teams (assignment_id);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  -- Kvůli pravidlu „jeden tým v úkolu“ (doplní trigger z týmu).
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (team_id, student_id),
  unique (assignment_id, student_id)
);
create index team_members_student_idx on public.team_members (student_id);

create table public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (length(body) <= 2000),
  file_path text,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default now(),
  check (length(trim(body)) > 0 or file_path is not null),
  check (file_path is null or split_part(file_path, '/', 1) = team_id::text)
);
create index team_messages_team_idx on public.team_messages (team_id, created_at desc);
create index team_messages_author_idx on public.team_messages (author_id);

-- ---------------------------------------------------------------------------
-- Pomocné funkce
-- ---------------------------------------------------------------------------

create function public.team_assignment(team uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.assignment_id from public.teams t where t.id = team
$$;

/** Tým studenta u týmového úkolu, jinak null. */
create or replace function public.assignment_team(assignment uuid, student uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.team_id
  from public.team_members m
  join public.assignments a on a.id = m.assignment_id
  where m.assignment_id = assignment and m.student_id = student and a.team_work
$$;

-- Člen týmu: zapsaný ve třídě úkolu, tým nesmí být plný.
create function public.prepare_team_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  select x.id, x.activity_id, x.team_max_size into a
  from public.assignments x join public.teams t on t.assignment_id = x.id
  where t.id = new.team_id;
  new.assignment_id := a.id;
  if not exists (select 1 from public.enrollments e where e.activity_id = a.activity_id and e.student_id = new.student_id) then
    raise exception 'Do týmu může jen student zapsaný ve třídě.' using errcode = 'check_violation';
  end if;
  if a.team_max_size is not null
     and (select count(*) from public.team_members m where m.team_id = new.team_id and m.student_id <> new.student_id) >= a.team_max_size then
    raise exception 'Tým je plný (nejvýš % lidí).', a.team_max_size using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger prepare_team_member before insert or update on public.team_members
  for each row execute function public.prepare_team_member();

-- Odepsaný student vypadne z týmů úkolů té třídy.
create or replace function public.drop_team_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.team_members m
  using public.assignments a
  where a.id = m.assignment_id and a.activity_id = old.activity_id and m.student_id = old.student_id;
  return null;
end;
$$;

-- Hodnocení člena týmu → stejné hodnocení ostatním (kromě individuálně hodnocených).
create or replace function public.mirror_team_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team uuid;
begin
  if pg_trigger_depth() > 1 or new.individual then
    return null;
  end if;
  team := public.assignment_team(new.assignment_id, new.student_id);
  if team is null then
    return null;
  end if;
  insert into public.reviews (assignment_id, student_id, result, points, feedback, request, reviewed_by, reviewed_at, individual)
  select new.assignment_id, m.student_id, new.result, new.points, new.feedback, new.request, new.reviewed_by, new.reviewed_at, false
  from public.team_members m
  where m.team_id = team and m.student_id <> new.student_id
  on conflict (assignment_id, student_id) do update
    set result = excluded.result, points = excluded.points, feedback = excluded.feedback,
        request = excluded.request, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at
    where not public.reviews.individual;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Studenti se rozdělují sami (team_mode = 'students')
-- ---------------------------------------------------------------------------

create function public.self_team_check(assignment uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.assignments a
    where a.id = assignment and a.team_work and a.team_mode = 'students'
  ) then
    raise exception 'U tohoto úkolu týmy rozděluje vyučující.' using errcode = 'insufficient_privilege';
  end if;
  if not public.in_assignment_class(assignment) then
    raise exception 'Do této třídy nepatříš.' using errcode = 'insufficient_privilege';
  end if;
  if public.is_review_final(assignment, (select auth.uid())) then
    raise exception 'Úkol už je ohodnocený.' using errcode = 'check_violation';
  end if;
end;
$$;

/** Student založí tým a rovnou se stane jeho členem. */
create function public.create_own_team(assignment uuid, team_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  team uuid;
begin
  perform public.self_team_check(assignment);
  if public.assignment_team(assignment, (select auth.uid())) is not null then
    raise exception 'Už jsi v týmu. Nejdřív z něj odejdi.' using errcode = 'check_violation';
  end if;
  insert into public.teams (assignment_id, name) values (assignment, trim(team_name)) returning id into team;
  insert into public.team_members (team_id, student_id) values (team, (select auth.uid()));
  return team;
end;
$$;

/** Student se přidá do existujícího týmu. */
create function public.join_team(team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  assignment uuid := public.team_assignment(team);
begin
  if assignment is null then
    raise exception 'Tým neexistuje.' using errcode = 'no_data_found';
  end if;
  perform public.self_team_check(assignment);
  if public.assignment_team(assignment, (select auth.uid())) is not null then
    raise exception 'Už jsi v týmu. Nejdřív z něj odejdi.' using errcode = 'check_violation';
  end if;
  insert into public.team_members (team_id, student_id) values (team, (select auth.uid()));
end;
$$;

/** Student odejde z týmu; prázdný tým zmizí. */
create function public.leave_team(team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  assignment uuid := public.team_assignment(team);
begin
  if assignment is null then
    return;
  end if;
  perform public.self_team_check(assignment);
  delete from public.team_members m where m.team_id = team and m.student_id = (select auth.uid());
  delete from public.teams t where t.id = team and not exists (select 1 from public.team_members m where m.team_id = team);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_messages enable row level security;

revoke all on public.teams, public.team_members, public.team_messages from anon, authenticated;
grant select, insert, update, delete on public.teams, public.team_members to authenticated;
grant select, insert, delete on public.team_messages to authenticated;

create policy "třída vidí týmy úkolu" on public.teams
  for select to authenticated
  using (public.manages_assignment(assignment_id) or public.in_assignment_class(assignment_id));
create policy "vyučující spravuje týmy" on public.teams
  for all to authenticated
  using (public.manages_assignment(assignment_id))
  with check (public.manages_assignment(assignment_id));
create policy "tým si mění název" on public.teams
  for update to authenticated
  using (public.is_team_member(id))
  with check (public.is_team_member(id));

create policy "třída vidí členy týmů" on public.team_members
  for select to authenticated
  using (public.manages_assignment(assignment_id) or public.in_assignment_class(assignment_id));
create policy "vyučující skládá týmy" on public.team_members
  for all to authenticated
  using (public.manages_assignment(assignment_id))
  with check (public.manages_assignment(public.team_assignment(team_id)));

create policy "tým a vyučující čtou chat" on public.team_messages
  for select to authenticated
  using (public.is_team_member(team_id) or public.manages_assignment(public.team_assignment(team_id)));
create policy "tým a vyučující píšou" on public.team_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (public.is_team_member(team_id) or public.manages_assignment(public.team_assignment(team_id)))
  );
create policy "autor nebo vyučující maže" on public.team_messages
  for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.is_member())
    or public.manages_assignment(public.team_assignment(team_id))
  );

create policy "týmy: tým a vyučující nahrávají" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tymy'
    and (public.is_team_member(public.storage_folder_uuid(name))
      or public.manages_assignment(public.team_assignment(public.storage_folder_uuid(name))))
  );
create policy "týmy: tým a vyučující čtou" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tymy'
    and (public.is_team_member(public.storage_folder_uuid(name))
      or public.manages_assignment(public.team_assignment(public.storage_folder_uuid(name))))
  );

alter publication supabase_realtime add table public.team_messages;

revoke execute on function public.team_assignment, public.prepare_team_member, public.self_team_check,
  public.create_own_team, public.join_team, public.leave_team from public, anon;
revoke execute on function public.prepare_team_member, public.self_team_check from authenticated;
grant execute on function public.team_assignment, public.create_own_team, public.join_team, public.leave_team to authenticated;
