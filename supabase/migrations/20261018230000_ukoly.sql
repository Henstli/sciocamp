-- ScioCamp etapa 2: úkoly, odevzdávání, hodnocení, soukromé komentáře.
-- Hodnocení bez známek: body z maxima, výsledek splněno / nesplněno / vráceno
-- (s požadavkem, co doplnit) a slovní hodnocení.

create type public.assignment_kind as enum ('ukol', 'material');
create type public.submission_status as enum ('rozpracovano', 'odevzdano');
create type public.review_result as enum ('splneno', 'nesplneno', 'vraceno');

-- Úkol nebo materiál v kurzu/ateliéru.
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  kind public.assignment_kind not null default 'ukol',
  title text not null check (length(title) between 1 and 200),
  instructions text not null default '',
  -- Téma, podle kterého se úkoly v třídě seskupují („Téma 1 · Struktura a příběh“).
  topic text,
  due_at timestamptz,
  -- Maximum bodů; null = úkol bez bodů.
  max_points integer check (max_points between 1 and 1000),
  -- Odkazy od vyučujícího: [{ "title": "...", "url": "https://..." }]
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'ukol' or (due_at is null and max_points is null))
);

create index assignments_activity_idx on public.assignments (activity_id);

-- Práce studenta. Soubory leží ve Storage (bucket „odevzdani“), tady jsou odkazy a stav.
create table public.submissions (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status public.submission_status not null default 'rozpracovano',
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  note text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

-- Hodnocení od vyučujícího (zvlášť, aby si ho student nemohl přepsat).
create table public.reviews (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  result public.review_result not null,
  points integer check (points >= 0),
  feedback text,
  -- Co má student doplnit, když je práce vrácená.
  request text,
  reviewed_by uuid not null default auth.uid() references public.profiles (id),
  reviewed_at timestamptz not null default now(),
  primary key (assignment_id, student_id),
  check (result <> 'vraceno' or coalesce(length(trim(request)), 0) > 0)
);

-- Soukromé komentáře: vlákno patří jednomu studentovi u jednoho úkolu.
create table public.assignment_comments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index assignment_comments_thread_idx on public.assignment_comments (assignment_id, student_id, created_at);

-- ---------------------------------------------------------------------------
-- Pomocné funkce
-- ---------------------------------------------------------------------------

create function public.assignment_activity(assignment uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.activity_id from public.assignments a where a.id = assignment
$$;

/** Vyučující dané třídy nebo admin. */
create function public.manages_assignment(assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.teaches(public.assignment_activity(assignment))
$$;

/** Student zapsaný ve třídě, kam úkol patří. */
create function public.in_assignment_class(assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and public.is_enrolled(public.assignment_activity(assignment))
$$;

/** Je práce studenta už uzavřená hodnocením (splněno / nesplněno)? Vrácenou může upravit. */
create function public.is_review_final(assignment uuid, student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reviews r
    where r.assignment_id = assignment and r.student_id = student and r.result <> 'vraceno'
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.reviews enable row level security;
alter table public.assignment_comments enable row level security;

revoke all on public.assignments, public.submissions, public.reviews, public.assignment_comments from anon;
grant select, insert, update, delete on public.assignments, public.reviews to authenticated;
grant select, insert, update on public.submissions to authenticated;
grant select, insert on public.assignment_comments to authenticated;

-- Úkoly vidí zapsaní studenti, vyučující třídy a admin. Spravuje je vyučující a admin.
create policy "kdo vidí úkoly" on public.assignments
  for select to authenticated
  using (public.is_admin() or public.teaches(activity_id) or (public.is_member() and public.is_enrolled(activity_id)));

create policy "vyučující spravuje úkoly" on public.assignments
  for all to authenticated
  using (public.is_admin() or public.teaches(activity_id))
  with check (public.is_admin() or public.teaches(activity_id));

-- Odevzdání: student svoje, vyučující a admin všechna ve své třídě.
create policy "kdo vidí odevzdání" on public.submissions
  for select to authenticated
  using ((student_id = (select auth.uid()) and public.is_member()) or public.manages_assignment(assignment_id));

create policy "student zakládá svou práci" on public.submissions
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and public.in_assignment_class(assignment_id)
    and not public.is_review_final(assignment_id, student_id)
  );

create policy "student upravuje svou práci do ohodnocení" on public.submissions
  for update to authenticated
  using (student_id = (select auth.uid()) and public.in_assignment_class(assignment_id) and not public.is_review_final(assignment_id, student_id))
  with check (student_id = (select auth.uid()) and not public.is_review_final(assignment_id, student_id));

-- Hodnocení: student vidí své, zapisuje jen vyučující třídy a admin.
create policy "kdo vidí hodnocení" on public.reviews
  for select to authenticated
  using ((student_id = (select auth.uid()) and public.is_member()) or public.manages_assignment(assignment_id));

create policy "vyučující hodnotí" on public.reviews
  for all to authenticated
  using (public.manages_assignment(assignment_id))
  with check (
    public.manages_assignment(assignment_id)
    and exists (
      select 1 from public.enrollments e
      where e.activity_id = public.assignment_activity(assignment_id) and e.student_id = reviews.student_id
    )
  );

-- Soukromé komentáře: vlákno vidí jen ten student a vyučující třídy (a admin).
create policy "kdo vidí soukromé komentáře" on public.assignment_comments
  for select to authenticated
  using ((student_id = (select auth.uid()) and public.is_member()) or public.manages_assignment(assignment_id));

create policy "kdo píše soukromé komentáře" on public.assignment_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (student_id = (select auth.uid()) and public.in_assignment_class(assignment_id))
      or public.manages_assignment(assignment_id)
    )
  );

-- Body nesmí přesáhnout maximum úkolu.
create function public.check_review_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  max_p integer;
begin
  select a.max_points into max_p from public.assignments a where a.id = new.assignment_id;
  if new.points is not null and (max_p is null or new.points > max_p) then
    raise exception 'Body musí být mezi 0 a maximem úkolu' using errcode = 'check_violation';
  end if;
  new.reviewed_at := now();
  return new;
end;
$$;

create trigger check_review_points
  before insert or update on public.reviews
  for each row execute function public.check_review_points();

-- Čas odevzdání nastavuje databáze, ne prohlížeč.
create function public.stamp_submission() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'odevzdano' and (tg_op = 'INSERT' or old.status <> 'odevzdano') then
    new.submitted_at := now();
  elsif new.status = 'rozpracovano' then
    new.submitted_at := null;
  end if;
  return new;
end;
$$;

create trigger stamp_submission
  before insert or update on public.submissions
  for each row execute function public.stamp_submission();

create function public.touch_assignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_assignment
  before update on public.assignments
  for each row execute function public.touch_assignment();

revoke execute on function public.assignment_activity, public.manages_assignment, public.in_assignment_class,
  public.is_review_final, public.check_review_points, public.stamp_submission, public.touch_assignment from public, anon;
grant execute on function public.assignment_activity, public.manages_assignment, public.in_assignment_class,
  public.is_review_final to authenticated;
