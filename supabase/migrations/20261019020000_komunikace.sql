-- ScioCamp etapa 3: nástěnka, chat třídy, soukromé zprávy a notifikace.
--
-- • Nástěnka (posts): příspěvky píše vyučující třídy a admin, komentovat
--   může každý ve třídě. Přílohy ve Storage (bucket „prispevky“, složka = id třídy).
-- • Chat třídy (class_messages): píše a čte každý ve třídě, mazat smí autor,
--   vyučující třídy a admin.
-- • Zprávy (conversations, messages): soukromé konverzace dvou lidí ze školy.
--   Konverzaci zakládá funkce start_conversation(), přílohy v bucketu „zpravy“.
-- • Notifikace (notifications): zakládají je jen triggery (nový úkol, oznámení,
--   hodnocení, odevzdání, komentáře). Uživatel je čte a označuje jako přečtené.

-- ---------------------------------------------------------------------------
-- Pomocné funkce
-- ---------------------------------------------------------------------------

/** Patří přihlášený do třídy? (zapsaný student, její vyučující, admin) */
create function public.in_class(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and (public.is_admin() or public.teaches(activity) or public.is_enrolled(activity))
$$;

/** Spravuje přihlášený třídu? (její vyučující nebo admin) */
create function public.manages_class(activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.teaches(activity)
$$;

/** První složka cesty ve Storage jako uuid (null, když to uuid není). */
create function public.storage_folder_uuid(object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return ((storage.foldername(object_name))[1])::uuid;
exception when others then
  return null;
end;
$$;

/** Adresa detailu třídy (stejně jako activityHref v aplikaci). */
create function public.class_href(activity uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when a.kind = 'atelier' then '/ateliery/' else '/kurzy/' end || a.slug
  from public.activities a where a.id = activity
$$;

-- ---------------------------------------------------------------------------
-- Nástěnka
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  -- [{ "title": "...", "url": "https://..." }]
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  -- [{ "path": "<id třídy>/…", "name": "...", "size": 123 }]
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_activity_idx on public.posts (activity_id, created_at desc);
create index posts_author_idx on public.posts (author_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index post_comments_author_idx on public.post_comments (author_id);

create function public.post_activity(post uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select activity_id from public.posts where id = post
$$;

-- ---------------------------------------------------------------------------
-- Chat třídy
-- ---------------------------------------------------------------------------

create table public.class_messages (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index class_messages_activity_idx on public.class_messages (activity_id, created_at desc);
create index class_messages_author_idx on public.class_messages (author_id);

-- ---------------------------------------------------------------------------
-- Soukromé zprávy
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- „<menší uuid>:<větší uuid>“ — jedna konverzace na dvojici lidí
  pair_key text not null unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (length(body) <= 4000),
  -- Příloha ve Storage (bucket „zpravy“, složka = id konverzace)
  file_path text,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default now(),
  check (length(trim(body)) > 0 or file_path is not null),
  check (file_path is null or split_part(file_path, '/', 1) = conversation_id::text)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_author_idx on public.messages (author_id);

create function public.in_conversation(conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conversation and m.user_id = (select auth.uid())
  )
$$;

/** Najde nebo založí konverzaci s druhým člověkem a vrátí její id. */
create function public.start_conversation(other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  key text;
  conv uuid;
begin
  if not public.is_member() then
    raise exception 'Nejsi přihlášený.' using errcode = 'insufficient_privilege';
  end if;
  if other is null or other = me or not exists (select 1 from public.profiles p where p.id = other and not p.blocked) then
    raise exception 'Tomuhle člověku napsat nejde.' using errcode = 'invalid_parameter_value';
  end if;
  key := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  insert into public.conversations (pair_key) values (key)
  on conflict (pair_key) do update set pair_key = excluded.pair_key
  returning id into conv;
  insert into public.conversation_members (conversation_id, user_id)
  values (conv, me), (conv, other)
  on conflict do nothing;
  return conv;
end;
$$;

/** Po nové zprávě: posunout čas konverzace, odesílateli ji označit jako přečtenou. */
create function public.after_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_members set last_read_at = new.created_at
  where conversation_id = new.conversation_id and user_id = new.author_id;
  return null;
end;
$$;
create trigger after_message after insert on public.messages
  for each row execute function public.after_message();

/** Moje konverzace s posledním zprávou a počtem nepřečtených (pro seznam vlevo). */
create function public.my_conversations()
returns table (
  conversation_id uuid,
  other_id uuid,
  last_message_at timestamptz,
  last_body text,
  last_author uuid,
  last_has_file boolean,
  unread integer
)
language sql stable security invoker set search_path = '' as $$
  select
    c.id,
    o.user_id,
    c.last_message_at,
    lm.body,
    lm.author_id,
    lm.file_path is not null,
    (select count(*)::int from public.messages x
      where x.conversation_id = c.id and x.author_id <> me.user_id and x.created_at > me.last_read_at)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_members o on o.conversation_id = c.id and o.user_id <> me.user_id
  left join lateral (
    select m.body, m.author_id, m.file_path from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
    and exists (select 1 from public.messages m where m.conversation_id = c.id)
  order by c.last_message_at desc
$$;

-- ---------------------------------------------------------------------------
-- Notifikace
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

/** Rozešle notifikaci (bez autora akce). Volají ji jen triggery. */
create function public.notify(users uuid[], kind text, title text, body text, href text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, href)
  select distinct u, kind, title, body, href
  from unnest(users) as u
  where u is not null and u is distinct from (select auth.uid())
$$;

create function public.class_students(activity uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(e.student_id), '{}') from public.enrollments e where e.activity_id = activity
$$;

create function public.profile_name(person uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)) from public.profiles p where p.id = person
$$;

-- Nový úkol nebo materiál → zapsaní studenti
create function public.notify_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(
    public.class_students(new.activity_id),
    new.kind::text,
    case when new.kind = 'ukol' then 'Nový úkol: ' else 'Nový materiál: ' end || new.title,
    (select a.title from public.activities a where a.id = new.activity_id),
    '/ukoly/' || new.id
  );
  return null;
end;
$$;
create trigger notify_assignment after insert on public.assignments
  for each row execute function public.notify_assignment();

-- Nové oznámení na nástěnce → studenti a vyučující třídy (kromě autora)
create function public.notify_post() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  act record;
begin
  select a.title, a.teacher_id into act from public.activities a where a.id = new.activity_id;
  perform public.notify(
    public.class_students(new.activity_id) || act.teacher_id,
    'oznameni',
    public.profile_name(new.author_id) || ' přidal(a) oznámení',
    act.title || ': ' || left(new.body, 140),
    public.class_href(new.activity_id)
  );
  return null;
end;
$$;
create trigger notify_post after insert on public.posts
  for each row execute function public.notify_post();

-- Komentář pod příspěvkem → autor příspěvku
create function public.notify_post_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  select author_id, activity_id into p from public.posts where id = new.post_id;
  perform public.notify(
    array[p.author_id],
    'komentar',
    public.profile_name(new.author_id) || ' okomentoval(a) tvůj příspěvek',
    left(new.body, 140),
    public.class_href(p.activity_id)
  );
  return null;
end;
$$;
create trigger notify_post_comment after insert on public.post_comments
  for each row execute function public.notify_post_comment();

-- Hodnocení → student
create function public.notify_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.result = old.result and new.points is not distinct from old.points
     and new.feedback is not distinct from old.feedback and new.request is not distinct from old.request then
    return null;
  end if;
  perform public.notify(
    array[new.student_id],
    'hodnoceni',
    case new.result
      when 'splneno' then 'Úkol je splněný: '
      when 'nesplneno' then 'Úkol je nesplněný: '
      else 'Úkol je vrácený k doplnění: '
    end || (select a.title from public.assignments a where a.id = new.assignment_id),
    case when new.result = 'vraceno' then left(new.request, 140) else left(new.feedback, 140) end,
    '/ukoly/' || new.assignment_id
  );
  return null;
end;
$$;
create trigger notify_review after insert or update on public.reviews
  for each row execute function public.notify_review();

-- Odevzdaná práce → vyučující třídy
create function public.notify_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  -- Nové odevzdání = nový čas odevzdání (i znovuodevzdání po vrácení, viz stamp_submission).
  if new.status <> 'odevzdano' or (tg_op = 'UPDATE' and new.submitted_at is not distinct from old.submitted_at) then
    return null;
  end if;
  select a.title, ac.teacher_id into t
  from public.assignments a join public.activities ac on ac.id = a.activity_id
  where a.id = new.assignment_id;
  perform public.notify(
    array[t.teacher_id],
    'odevzdani',
    public.profile_name(new.student_id) || ' odevzdal(a) úkol',
    t.title,
    '/ukoly/' || new.assignment_id || '?student=' || new.student_id
  );
  return null;
end;
$$;
create trigger notify_submission after insert or update on public.submissions
  for each row execute function public.notify_submission();

-- Soukromý komentář u úkolu → druhá strana vlákna
create function public.notify_assignment_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  select a.title, ac.teacher_id into t
  from public.assignments a join public.activities ac on ac.id = a.activity_id
  where a.id = new.assignment_id;
  if new.author_id = new.student_id then
    perform public.notify(array[t.teacher_id], 'komentar',
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
create trigger notify_assignment_comment after insert on public.assignment_comments
  for each row execute function public.notify_assignment_comment();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.class_messages enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

revoke all on public.posts, public.post_comments, public.class_messages, public.conversations,
  public.conversation_members, public.messages, public.notifications from anon, authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.post_comments, public.class_messages, public.messages to authenticated;
grant select on public.conversations, public.conversation_members, public.notifications to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

-- Nástěnka
create policy "třída vidí příspěvky" on public.posts
  for select to authenticated using (public.in_class(activity_id));
create policy "vyučující píše příspěvky" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.manages_class(activity_id));
create policy "autor upravuje příspěvek" on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()) and public.manages_class(activity_id))
  with check (author_id = (select auth.uid()) and public.manages_class(activity_id));
create policy "autor nebo vyučující maže příspěvek" on public.posts
  for delete to authenticated
  using (public.manages_class(activity_id) or (author_id = (select auth.uid()) and public.is_member()));

create policy "třída vidí komentáře" on public.post_comments
  for select to authenticated using (public.in_class(public.post_activity(post_id)));
create policy "třída komentuje" on public.post_comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.in_class(public.post_activity(post_id)));
create policy "autor nebo vyučující maže komentář" on public.post_comments
  for delete to authenticated
  using ((author_id = (select auth.uid()) and public.is_member()) or public.manages_class(public.post_activity(post_id)));

-- Chat třídy
create policy "třída čte chat" on public.class_messages
  for select to authenticated using (public.in_class(activity_id));
create policy "třída píše do chatu" on public.class_messages
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.in_class(activity_id));
create policy "autor nebo vyučující maže zprávu" on public.class_messages
  for delete to authenticated
  using ((author_id = (select auth.uid()) and public.in_class(activity_id)) or public.manages_class(activity_id));

-- Zprávy
create policy "účastníci vidí konverzaci" on public.conversations
  for select to authenticated using (public.in_conversation(id));
create policy "účastníci vidí členy" on public.conversation_members
  for select to authenticated using (public.in_conversation(conversation_id));
create policy "označit přečtené" on public.conversation_members
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member())
  with check (user_id = (select auth.uid()));
create policy "účastníci čtou zprávy" on public.messages
  for select to authenticated using (public.in_conversation(conversation_id));
create policy "účastníci píšou zprávy" on public.messages
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.in_conversation(conversation_id));
create policy "autor maže svou zprávu" on public.messages
  for delete to authenticated
  using (author_id = (select auth.uid()) and public.in_conversation(conversation_id));

-- Notifikace
create policy "vlastní notifikace" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "označit notifikaci" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "smazat notifikaci" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: přílohy příspěvků a zpráv
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('prispevky', 'prispevky', false, 26214400), ('zpravy', 'zpravy', false, 26214400)
on conflict (id) do nothing;

create policy "příspěvky: vyučující nahrává" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prispevky' and public.manages_class(public.storage_folder_uuid(name)));
create policy "příspěvky: vyučující maže" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prispevky' and public.manages_class(public.storage_folder_uuid(name)));
create policy "příspěvky: třída čte" on storage.objects
  for select to authenticated
  using (bucket_id = 'prispevky' and public.in_class(public.storage_folder_uuid(name)));

create policy "zprávy: účastník nahrává" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'zpravy' and public.in_conversation(public.storage_folder_uuid(name)));
create policy "zprávy: účastníci čtou" on storage.objects
  for select to authenticated
  using (bucket_id = 'zpravy' and public.in_conversation(public.storage_folder_uuid(name)));

-- ---------------------------------------------------------------------------
-- Realtime: chat, zprávy a notifikace chodí naživo (Realtime respektuje RLS)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.class_messages, public.messages, public.notifications;

-- ---------------------------------------------------------------------------
-- Oprávnění k funkcím
-- ---------------------------------------------------------------------------

revoke execute on function public.in_class, public.manages_class, public.storage_folder_uuid, public.class_href,
  public.post_activity, public.in_conversation, public.start_conversation, public.after_message,
  public.my_conversations, public.notify, public.class_students, public.profile_name,
  public.notify_assignment, public.notify_post, public.notify_post_comment, public.notify_review,
  public.notify_submission, public.notify_assignment_comment
  from public, anon;
-- Potřebné v pravidlech RLS a volané z aplikace:
grant execute on function public.in_class, public.manages_class, public.storage_folder_uuid,
  public.post_activity, public.in_conversation, public.start_conversation, public.my_conversations to authenticated;
-- Rozesílání notifikací jen z triggerů:
revoke execute on function public.notify, public.class_students, public.profile_name, public.class_href,
  public.after_message, public.notify_assignment, public.notify_post, public.notify_post_comment,
  public.notify_review, public.notify_submission, public.notify_assignment_comment from authenticated;
