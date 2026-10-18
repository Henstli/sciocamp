-- ScioCamp: základ databáze (etapa 1)
-- Uživatelé a role, ročníky, bloky, kurzy/ateliéry, rozvrh, zápisy.
-- Oprávnění řeší Row Level Security: aplikace se k databázi připojuje jako
-- přihlášený uživatel, takže každý dotaz vidí jen to, co mu role dovolí.

-- ---------------------------------------------------------------------------
-- Typy
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('student', 'ucitel', 'admin');
create type public.activity_kind as enum ('kurz', 'atelier', 'ostatni');
create type public.activity_tone as enum ('blue', 'blueDark', 'violet', 'teal');

-- Školní doména na jednom místě. Při změně domény stačí upravit tuhle funkci.
create function public.school_domain() returns text
language sql immutable as $$ select 'scioskola.cz' $$;

create function public.is_school_email(email text) returns boolean
language sql immutable as $$
  select lower(coalesce(email, '')) like '%@' || public.school_domain()
$$;

-- ---------------------------------------------------------------------------
-- Profily (1:1 k auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (public.is_school_email(email)),
  full_name text not null default '',
  role public.app_role not null default 'student',
  -- Ročník 1–4 u studentů; u vyučujících prázdné.
  grade smallint check (grade between 1 and 4),
  -- Popisek u vyučujících („Plný úvazek“, „Externí lektorka“ …).
  staff_note text,
  bio text,
  -- true, jakmile se uživatel poprvé přihlásí (do té doby „pozvánka odeslána“).
  activated boolean not null default false,
  -- Admin může přístup zablokovat, aniž by účet mazal.
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint grade_only_for_students check (role = 'student' or grade is null)
);

comment on table public.profiles is 'Uživatelé školy. Zakládá je admin pozvánkou, veřejná registrace není.';

-- ---------------------------------------------------------------------------
-- Pomocné funkce pro oprávnění (security definer, aby nevznikla rekurze v RLS)
-- ---------------------------------------------------------------------------

create function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and not p.blocked
$$;

create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role() is not null
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('ucitel', 'admin'), false)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- ---------------------------------------------------------------------------
-- Bloky (období výuky a zápisů)
-- ---------------------------------------------------------------------------

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  enrollment_until timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- ---------------------------------------------------------------------------
-- Aktivity: kurzy, ateliéry a ostatní (třídnická hodina, expedice …)
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  -- Adresa v aplikaci: /kurzy/<slug>, /ateliery/<slug>
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind public.activity_kind not null,
  title text not null,
  description text,
  teacher_id uuid not null references public.profiles (id),
  block_id uuid references public.blocks (id) on delete set null,
  room text not null default '',
  meet_url text check (meet_url is null or meet_url ~ '^https://meet\.google\.com/[a-z0-9-]+$'),
  capacity integer check (capacity > 0),
  -- Pro které ročníky je aktivita určená; null = pro všechny.
  allowed_grades smallint[] check (allowed_grades <@ array[1, 2, 3, 4]::smallint[]),
  tone public.activity_tone not null default 'blue',
  project_name text,
  milestones_done smallint not null default 0 check (milestones_done >= 0),
  milestones_total smallint not null default 0 check (milestones_total >= milestones_done),
  created_at timestamptz not null default now()
);

create index activities_teacher_idx on public.activities (teacher_id);

create table public.activity_slots (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);

create index activity_slots_activity_idx on public.activity_slots (activity_id);

create table public.enrollments (
  activity_id uuid not null references public.activities (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);

create index enrollments_student_idx on public.enrollments (student_id);

create function public.teaches(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.activities a
    where a.id = activity and a.teacher_id = (select auth.uid())
  ) and public.is_staff()
$$;

create function public.is_enrolled(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    where e.activity_id = activity and e.student_id = (select auth.uid())
  )
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.activities enable row level security;
alter table public.activity_slots enable row level security;
alter table public.enrollments enable row level security;

-- Profily: adresář školy vidí každý člen. Měnit smí jen své „o mně“;
-- role, ročníky a zakládání účtů dělá admin přes serverovou akci (service role).
create policy "členové vidí profily" on public.profiles
  for select to authenticated using (public.is_member());

create policy "vlastní profil: o mně" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and public.is_member())
  with check (id = (select auth.uid()));

-- Přístup k tabulkám výslovně (nezávisle na nastavení „Automatically expose new tables“).
-- Anonymní návštěvník nesmí nic; přihlášený jen to, co povolí politiky RLS výše i níže.
revoke all on public.profiles, public.blocks, public.activities, public.activity_slots, public.enrollments from anon;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.blocks, public.activities, public.activity_slots, public.enrollments to authenticated;
revoke update on public.profiles from authenticated;
grant update (bio) on public.profiles to authenticated;

-- Bloky
create policy "členové vidí bloky" on public.blocks
  for select to authenticated using (public.is_member());
create policy "admin spravuje bloky" on public.blocks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Aktivity: nabídku vidí všichni členové (kvůli zápisům).
create policy "členové vidí aktivity" on public.activities
  for select to authenticated using (public.is_member());

create policy "vyučující zakládá své aktivity" on public.activities
  for insert to authenticated
  with check (public.is_admin() or (public.is_staff() and teacher_id = (select auth.uid())));

create policy "vyučující a admin upravují" on public.activities
  for update to authenticated
  using (public.is_admin() or (public.is_staff() and teacher_id = (select auth.uid())))
  with check (public.is_admin() or (public.is_staff() and teacher_id = (select auth.uid())));

create policy "admin maže aktivity" on public.activities
  for delete to authenticated using (public.is_admin());

-- Rozvrh aktivit
create policy "členové vidí rozvrh" on public.activity_slots
  for select to authenticated using (public.is_member());

create policy "vyučující a admin upravují rozvrh" on public.activity_slots
  for all to authenticated
  using (public.is_admin() or public.teaches(activity_id))
  with check (public.is_admin() or public.teaches(activity_id));

-- Zápisy: student vidí své zápisy a spolužáky ve svých třídách, vyučující vše.
create policy "kdo vidí zápisy" on public.enrollments
  for select to authenticated
  using (
    public.is_staff()
    or (public.is_member() and (student_id = (select auth.uid()) or public.is_enrolled(activity_id)))
  );

create policy "vyučující a admin zapisují" on public.enrollments
  for all to authenticated
  using (public.is_admin() or public.teaches(activity_id))
  with check (public.is_admin() or public.teaches(activity_id));

-- ---------------------------------------------------------------------------
-- Napojení na auth.users
-- ---------------------------------------------------------------------------

-- Do auth.users se nesmí dostat jiná než školní adresa (Google i e-mail).
create function public.guard_school_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_school_email(new.email) then
    raise exception 'Přihlásit se lze jen školním účtem @%', public.school_domain()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_school_domain
  before insert or update of email on auth.users
  for each row execute function public.guard_school_domain();

-- Nový účet dostane profil. Roli a ročník posílá admin v app_metadata,
-- kterou uživatel sám změnit nemůže.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta_role text := new.raw_app_meta_data ->> 'role';
  meta_grade text := new.raw_app_meta_data ->> 'grade';
begin
  insert into public.profiles (id, email, full_name, role, grade, staff_note)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when meta_role in ('student', 'ucitel', 'admin') then meta_role::public.app_role else 'student' end,
    case when coalesce(meta_role, 'student') = 'student' and meta_grade ~ '^[1-4]$' then meta_grade::smallint end,
    new.raw_app_meta_data ->> 'staff_note'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- První přihlášení přepne „pozvánka odeslána“ na „aktivní“.
create function public.handle_user_sign_in() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.last_sign_in_at is not null and old.last_sign_in_at is distinct from new.last_sign_in_at then
    update public.profiles set activated = true where id = new.id and not activated;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_signed_in
  after update of last_sign_in_at on auth.users
  for each row execute function public.handle_user_sign_in();

-- Pomocné funkce nemají být volatelné jako RPC anonymními uživateli.
revoke execute on function public.my_role, public.is_member, public.is_staff, public.is_admin,
  public.teaches, public.is_enrolled, public.guard_school_domain, public.handle_new_user,
  public.handle_user_sign_in from public, anon;
grant execute on function public.my_role, public.is_member, public.is_staff, public.is_admin,
  public.teaches, public.is_enrolled to authenticated;
