-- Rozdělení na expedici (pokoje, vaření, úklid, …): vyučující vypíše seznam
-- možností s kapacitou, studenti se sami přihlásí. Funguje pro jakoukoli třídu,
-- v aplikaci je zatím jen u expedic (záložka Rozdělení).
--
-- signup_boards  — seznam („Pokoje“), pravidla: kolik možností na studenta,
--                  povinné, ukazovat jména, uzavřeno / do kdy se dá přihlásit
-- signup_options — možnosti („Pokoj 2“, „Vaření út“) s kapacitou, volitelně den
-- signup_entries — kdo je kde (student se přihlašuje přes RPC, vyučující přiřazuje)

create table public.signup_boards (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  description text not null default '' check (length(description) <= 1000),
  max_per_student integer not null default 1 check (max_per_student between 1 and 50),
  required boolean not null default false,
  show_names boolean not null default true,
  locked boolean not null default false,
  closes_at timestamptz,
  position integer not null default 0,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index signup_boards_activity_idx on public.signup_boards (activity_id, position);

create table public.signup_options (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.signup_boards (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  day date,
  capacity integer check (capacity between 1 and 500),
  position integer not null default 0
);
create index signup_options_board_idx on public.signup_options (board_id, position);

create table public.signup_entries (
  option_id uuid not null references public.signup_options (id) on delete cascade,
  board_id uuid not null references public.signup_boards (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (option_id, student_id)
);
create index signup_entries_board_idx on public.signup_entries (board_id, student_id);

create function public.board_activity(board uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.activity_id from public.signup_boards b where b.id = board
$$;

alter table public.signup_boards enable row level security;
alter table public.signup_options enable row level security;
alter table public.signup_entries enable row level security;

create policy "rozdělení: třída čte" on public.signup_boards
  for select to authenticated using (public.in_class(activity_id));
create policy "rozdělení: vyučující zakládá" on public.signup_boards
  for insert to authenticated with check (public.manages_class(activity_id) and created_by = (select auth.uid()));
create policy "rozdělení: vyučující upravuje" on public.signup_boards
  for update to authenticated using (public.manages_class(activity_id)) with check (public.manages_class(activity_id));
create policy "rozdělení: vyučující maže" on public.signup_boards
  for delete to authenticated using (public.manages_class(activity_id));

create policy "možnosti: třída čte" on public.signup_options
  for select to authenticated using (public.in_class(public.board_activity(board_id)));
create policy "možnosti: vyučující zakládá" on public.signup_options
  for insert to authenticated with check (public.manages_class(public.board_activity(board_id)));
create policy "možnosti: vyučující upravuje" on public.signup_options
  for update to authenticated using (public.manages_class(public.board_activity(board_id)))
  with check (public.manages_class(public.board_activity(board_id)));
create policy "možnosti: vyučující maže" on public.signup_options
  for delete to authenticated using (public.manages_class(public.board_activity(board_id)));

-- Jména vidí vyučující vždy, student svoje a cizí jen u seznamu se „show_names“.
create policy "přihlášky: kdo smí vidět" on public.signup_entries
  for select to authenticated using (
    student_id = (select auth.uid())
    or public.manages_class(public.board_activity(board_id))
    or (
      public.in_class(public.board_activity(board_id))
      and exists (select 1 from public.signup_boards b where b.id = board_id and b.show_names)
    )
  );

grant select, insert, delete on public.signup_boards, public.signup_options to authenticated;
grant update (title, description, max_per_student, required, show_names, locked, closes_at, position)
  on public.signup_boards to authenticated;
grant update (label, day, capacity, position) on public.signup_options to authenticated;
grant select on public.signup_entries to authenticated;

/** Je seznam otevřený pro přihlašování studentů? */
create function public.board_open(b public.signup_boards) returns boolean
language sql stable set search_path = '' as $$
  select not b.locked and (b.closes_at is null or b.closes_at > now())
$$;

/** Student se přihlásí na možnost (kapacita a limit na studenta hlídané pod zámkem). */
create function public.signup_join(option uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  opt public.signup_options;
  board public.signup_boards;
  taken integer;
  mine integer;
begin
  select * into opt from public.signup_options o where o.id = option;
  if opt.id is null then
    raise exception 'Tahle možnost už neexistuje.' using errcode = 'invalid_parameter_value';
  end if;
  -- Zámek celého seznamu: dva studenti se nepřihlásí na poslední místo zároveň.
  select * into board from public.signup_boards b where b.id = opt.board_id for update;
  if not public.is_member() or not exists (
    select 1 from public.enrollments e where e.activity_id = board.activity_id and e.student_id = me
  ) then
    raise exception 'Přihlásit se můžou jen studenti zapsaní v téhle třídě.' using errcode = 'insufficient_privilege';
  end if;
  if not public.board_open(board) then
    raise exception 'Přihlašování je uzavřené.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.signup_entries e where e.option_id = option and e.student_id = me) then
    return;
  end if;
  select count(*) into taken from public.signup_entries e where e.option_id = option;
  if opt.capacity is not null and taken >= opt.capacity then
    raise exception 'Tohle už je plné.' using errcode = 'invalid_parameter_value';
  end if;
  select count(*) into mine from public.signup_entries e where e.board_id = board.id and e.student_id = me;
  if mine >= board.max_per_student then
    raise exception '%', case when board.max_per_student = 1
      then 'Už jsi přihlášený jinde. Nejdřív se tam odhlas.'
      else 'Víc možností si v tomhle seznamu vybrat nejde (nejvýš ' || board.max_per_student || ').' end
      using errcode = 'invalid_parameter_value';
  end if;
  insert into public.signup_entries (option_id, board_id, student_id) values (option, board.id, me);
end;
$$;

/** Student se odhlásí (jen když je přihlašování otevřené). */
create function public.signup_leave(option uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  board public.signup_boards;
begin
  select b.* into board from public.signup_boards b
  join public.signup_options o on o.board_id = b.id where o.id = option;
  if board.id is null then
    return;
  end if;
  if not public.board_open(board) then
    raise exception 'Přihlašování je uzavřené, změnu domluv s vyučujícím.' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.signup_entries e where e.option_id = option and e.student_id = (select auth.uid());
end;
$$;

/** Vyučující přiřadí studenta (i nad kapacitu a limit — ví, co dělá). */
create function public.signup_assign(option uuid, student uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  board public.signup_boards;
begin
  select b.* into board from public.signup_boards b
  join public.signup_options o on o.board_id = b.id where o.id = option;
  if board.id is null or not public.manages_class(board.activity_id) then
    raise exception 'Přiřazovat může jen vyučující třídy.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.enrollments e where e.activity_id = board.activity_id and e.student_id = student) then
    raise exception 'Tenhle student ve třídě není.' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.signup_entries (option_id, board_id, student_id, assigned_by)
  values (option, board.id, student, (select auth.uid()))
  on conflict do nothing;
  if found then
    perform public.notify(array[student], 'rozdeleni', 'Zapsali tě: ' || board.title,
      (select o.label from public.signup_options o where o.id = option),
      public.class_href(board.activity_id) || '?tab=rozdeleni');
  end if;
end;
$$;

/** Vyučující studenta z možnosti odebere. */
create function public.signup_unassign(option uuid, student uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  board public.signup_boards;
begin
  select b.* into board from public.signup_boards b
  join public.signup_options o on o.board_id = b.id where o.id = option;
  if board.id is null or not public.manages_class(board.activity_id) then
    raise exception 'Odebírat může jen vyučující třídy.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.signup_entries e where e.option_id = option and e.student_id = student;
  if found and student <> (select auth.uid()) then
    perform public.notify(array[student], 'rozdeleni', 'Odhlásili tě: ' || board.title,
      (select o.label from public.signup_options o where o.id = option),
      public.class_href(board.activity_id) || '?tab=rozdeleni');
  end if;
end;
$$;

/** Obsazenost možností ve třídě (počty i u seznamů, kde nejsou vidět jména). */
create function public.signup_counts(activity uuid)
returns table (option_id uuid, taken integer)
language sql stable security definer set search_path = '' as $$
  select o.id, (select count(*)::int from public.signup_entries e where e.option_id = o.id)
  from public.signup_options o
  join public.signup_boards b on b.id = o.board_id
  where b.activity_id = activity and public.in_class(activity)
$$;

-- Nový seznam → studentům třídy oznámení.
create function public.notify_signup_board() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(
    public.class_students(new.activity_id),
    'rozdeleni',
    'Nové rozdělení: ' || new.title,
    (select a.title from public.activities a where a.id = new.activity_id) ||
      case when new.closes_at is not null
        then ' · přihlas se do ' || to_char(new.closes_at at time zone 'Europe/Prague', 'FMDD. FMMM. HH24:MI')
        else ' · přihlas se' end,
    public.class_href(new.activity_id) || '?tab=rozdeleni'
  );
  return null;
end;
$$;
create trigger notify_signup_board after insert on public.signup_boards
  for each row execute function public.notify_signup_board();

-- Odepsaný student ze třídy vypadne i z rozdělení.
create function public.signup_drop_unenrolled() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.signup_entries e
  using public.signup_boards b
  where b.id = e.board_id and b.activity_id = old.activity_id and e.student_id = old.student_id;
  return null;
end;
$$;
create trigger signup_drop_unenrolled after delete on public.enrollments
  for each row execute function public.signup_drop_unenrolled();

revoke execute on function public.notify_signup_board, public.signup_drop_unenrolled from public, anon, authenticated;
revoke execute on function public.signup_join, public.signup_leave, public.signup_assign, public.signup_unassign, public.signup_counts
  from public, anon;
grant execute on function public.signup_join, public.signup_leave, public.signup_assign, public.signup_unassign, public.signup_counts
  to authenticated;

alter publication supabase_realtime add table public.signup_entries;
