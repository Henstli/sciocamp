-- Týmy a týmové úkoly.
--
-- • Týmy patří třídě (kurz, ateliér…): teams + team_members. Student je ve
--   třídě nejvýš v jednom týmu. Týmy zakládá a skládá vyučující třídy a admin.
-- • Týmový úkol (assignments.team_work): tým odevzdává jednu společnou práci.
--   Každý člen má dál svůj řádek v submissions/reviews (všechny přehledy a
--   počty tak fungují beze změny), ale triggery je drží stejné: změna práce
--   jednoho člena se propíše ostatním, hodnocení jednoho člena dostane celý tým.
--   Soubory týmu leží v bucketu „odevzdani“ ve složce <id úkolu>/<id týmu>/.
-- • Týmový chat (team_messages): píšou členové týmu, číst může i vyučující
--   třídy a admin. Přílohy v bucketu „tymy“ ve složce <id týmu>/.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index teams_activity_idx on public.teams (activity_id);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  -- Kvůli pravidlu „jeden tým ve třídě“ (doplní trigger z týmu).
  activity_id uuid not null references public.activities (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (team_id, student_id),
  unique (activity_id, student_id)
);
create index team_members_student_idx on public.team_members (student_id);

alter table public.assignments add column team_work boolean not null default false;
comment on column public.assignments.team_work is 'Týmový úkol: tým odevzdává společnou práci, hodnocení dostane celý tým.';

-- Člen týmu musí být zapsaný ve třídě; activity_id se bere z týmu.
create function public.prepare_team_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.activity_id := (select t.activity_id from public.teams t where t.id = new.team_id);
  if not exists (select 1 from public.enrollments e where e.activity_id = new.activity_id and e.student_id = new.student_id) then
    raise exception 'Do týmu může jen student zapsaný ve třídě.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger prepare_team_member before insert or update on public.team_members
  for each row execute function public.prepare_team_member();

-- Odepsaný student vypadne i z týmu.
create function public.drop_team_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.team_members m where m.activity_id = old.activity_id and m.student_id = old.student_id;
  return null;
end;
$$;
create trigger drop_team_membership after delete on public.enrollments
  for each row execute function public.drop_team_membership();

-- ---------------------------------------------------------------------------
-- Pomocné funkce
-- ---------------------------------------------------------------------------

/** Tým studenta u úkolu (jen u týmového úkolu, jinak null). */
create function public.assignment_team(assignment uuid, student uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.team_id
  from public.assignments a
  join public.team_members m on m.activity_id = a.activity_id and m.student_id = student
  where a.id = assignment and a.team_work
$$;

/** Je přihlášený členem týmu? */
create function public.is_team_member(team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and exists (
    select 1 from public.team_members m where m.team_id = team and m.student_id = (select auth.uid())
  )
$$;

create function public.team_activity(team uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.activity_id from public.teams t where t.id = team
$$;

/** Druhá složka cesty ve Storage jako uuid (null, když to uuid není). */
create function public.storage_subfolder_uuid(object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return ((storage.foldername(object_name))[2])::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Společná práce týmu
-- ---------------------------------------------------------------------------

-- Změna práce jednoho člena → stejná práce u ostatních členů týmu.
create function public.mirror_team_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team uuid;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  team := public.assignment_team(new.assignment_id, new.student_id);
  if team is null then
    return null;
  end if;
  insert into public.submissions (assignment_id, student_id, status, links, note)
  select new.assignment_id, m.student_id, new.status, new.links, new.note
  from public.team_members m
  where m.team_id = team and m.student_id <> new.student_id
    and not public.is_review_final(new.assignment_id, m.student_id)
  on conflict (assignment_id, student_id) do update
    set status = excluded.status, links = excluded.links, note = excluded.note;
  return null;
end;
$$;
create trigger mirror_team_submission after insert or update on public.submissions
  for each row execute function public.mirror_team_submission();

-- Hodnocení jednoho člena → stejné hodnocení celému týmu.
create function public.mirror_team_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team uuid;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  team := public.assignment_team(new.assignment_id, new.student_id);
  if team is null then
    return null;
  end if;
  insert into public.reviews (assignment_id, student_id, result, points, feedback, request, reviewed_by, reviewed_at)
  select new.assignment_id, m.student_id, new.result, new.points, new.feedback, new.request, new.reviewed_by, new.reviewed_at
  from public.team_members m
  where m.team_id = team and m.student_id <> new.student_id
  on conflict (assignment_id, student_id) do update
    set result = excluded.result, points = excluded.points, feedback = excluded.feedback,
        request = excluded.request, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
  return null;
end;
$$;
create trigger mirror_team_review after insert or update on public.reviews
  for each row execute function public.mirror_team_review();

-- Vyučujícímu stačí jedna notifikace o odevzdání za tým (zrcadlené řádky přeskočit).
create or replace function public.notify_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  team_name text;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if new.status <> 'odevzdano' or (tg_op = 'UPDATE' and new.submitted_at is not distinct from old.submitted_at) then
    return null;
  end if;
  select a.title, a.activity_id into t from public.assignments a where a.id = new.assignment_id;
  team_name := (select tm.name from public.teams tm where tm.id = public.assignment_team(new.assignment_id, new.student_id));
  perform public.notify(
    public.class_teachers(t.activity_id),
    'odevzdani',
    case when team_name is not null
      then 'Tým ' || team_name || ' odevzdal úkol'
      else public.profile_name(new.student_id) || ' odevzdal(a) úkol'
    end,
    t.title,
    '/ukoly/' || new.assignment_id || '?student=' || new.student_id
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Týmový chat
-- ---------------------------------------------------------------------------

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
-- RLS
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_messages enable row level security;

revoke all on public.teams, public.team_members, public.team_messages from anon, authenticated;
grant select, insert, update, delete on public.teams, public.team_members to authenticated;
grant select, insert, delete on public.team_messages to authenticated;

create policy "třída vidí týmy" on public.teams
  for select to authenticated using (public.in_class(activity_id));
create policy "vyučující spravuje týmy" on public.teams
  for all to authenticated using (public.manages_class(activity_id)) with check (public.manages_class(activity_id));

create policy "třída vidí členy týmů" on public.team_members
  for select to authenticated using (public.in_class(activity_id));
create policy "vyučující skládá týmy" on public.team_members
  for all to authenticated
  using (public.manages_class(activity_id))
  with check (public.manages_class(public.team_activity(team_id)));

create policy "tým a vyučující čtou chat" on public.team_messages
  for select to authenticated
  using (public.is_team_member(team_id) or public.manages_class(public.team_activity(team_id)));
create policy "tým a vyučující píšou" on public.team_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (public.is_team_member(team_id) or public.manages_class(public.team_activity(team_id)))
  );
create policy "autor nebo vyučující maže" on public.team_messages
  for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.is_member())
    or public.manages_class(public.team_activity(team_id))
  );

-- Soubory týmové práce: <id úkolu>/<id týmu>/… v bucketu „odevzdani“.
create policy "odevzdání: tým nahrává do své složky" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'odevzdani'
    and public.storage_subfolder_uuid(name) is not null
    and public.storage_subfolder_uuid(name) = public.assignment_team(public.submission_folder_assignment(name), (select auth.uid()))
    and not public.is_review_final(public.submission_folder_assignment(name), (select auth.uid()))
  );
create policy "odevzdání: tým maže ze své složky" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'odevzdani'
    and public.storage_subfolder_uuid(name) is not null
    and public.storage_subfolder_uuid(name) = public.assignment_team(public.submission_folder_assignment(name), (select auth.uid()))
    and not public.is_review_final(public.submission_folder_assignment(name), (select auth.uid()))
  );
create policy "odevzdání: tým čte svou složku" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'odevzdani'
    and public.storage_subfolder_uuid(name) is not null
    and public.storage_subfolder_uuid(name) = public.assignment_team(public.submission_folder_assignment(name), (select auth.uid()))
  );

-- Přílohy týmového chatu: <id týmu>/… v bucketu „tymy“.
insert into storage.buckets (id, name, public, file_size_limit)
values ('tymy', 'tymy', false, 26214400)
on conflict (id) do nothing;

create policy "týmy: tým a vyučující nahrávají" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tymy'
    and (public.is_team_member(public.storage_folder_uuid(name))
      or public.manages_class(public.team_activity(public.storage_folder_uuid(name))))
  );
create policy "týmy: tým a vyučující čtou" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tymy'
    and (public.is_team_member(public.storage_folder_uuid(name))
      or public.manages_class(public.team_activity(public.storage_folder_uuid(name))))
  );

alter publication supabase_realtime add table public.team_messages;

revoke execute on function public.prepare_team_member, public.drop_team_membership, public.mirror_team_submission,
  public.mirror_team_review, public.assignment_team, public.is_team_member, public.team_activity,
  public.storage_subfolder_uuid from public, anon;
revoke execute on function public.prepare_team_member, public.drop_team_membership, public.mirror_team_submission,
  public.mirror_team_review from authenticated;
grant execute on function public.assignment_team, public.is_team_member, public.team_activity, public.storage_subfolder_uuid to authenticated;
