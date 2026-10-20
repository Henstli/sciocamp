-- Ankety ve skupinových chatech (Zprávy, včetně celoškolního Campu).
-- Anketa je zpráva („📊 otázka“), ke které patří možnosti a hlasy.
-- Zakládá ji RPC create_chat_poll, hlasuje se přes vote_chat_poll,
-- ukončit ji smí autor, správce skupiny a v Campu vyučující a admin.

create table public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  question text not null check (length(trim(question)) between 1 and 200),
  multiple boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index chat_polls_conversation_idx on public.chat_polls (conversation_id);

create table public.chat_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 100),
  position smallint not null
);
create index chat_poll_options_poll_idx on public.chat_poll_options (poll_id);

create table public.chat_poll_votes (
  option_id uuid not null references public.chat_poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  poll_id uuid not null references public.chat_polls (id) on delete cascade,
  -- Pro RLS a Realtime filtr.
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index chat_poll_votes_poll_idx on public.chat_poll_votes (poll_id);
create index chat_poll_votes_conversation_idx on public.chat_poll_votes (conversation_id);

alter table public.chat_polls enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes enable row level security;
grant select on public.chat_polls, public.chat_poll_options, public.chat_poll_votes to authenticated;

create policy "skupina vidí ankety" on public.chat_polls
  for select to authenticated using (public.in_conversation(conversation_id));
create policy "skupina vidí možnosti" on public.chat_poll_options
  for select to authenticated
  using (public.in_conversation((select p.conversation_id from public.chat_polls p where p.id = poll_id)));
create policy "skupina vidí hlasy" on public.chat_poll_votes
  for select to authenticated using (public.in_conversation(conversation_id));

/** Založí anketu jako novou zprávu ve skupině. Vrací id zprávy. */
create function public.create_chat_poll(conversation uuid, question text, options text[], multiple boolean default false)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  q text := trim(question);
  clean text[];
  msg uuid;
  poll uuid;
  i int;
begin
  if not public.is_member() or not public.in_conversation(conversation)
    or not exists (select 1 from public.conversations c where c.id = conversation and c.is_group) then
    raise exception 'Anketu jde založit jen ve skupině, ve které jsi.' using errcode = '42501';
  end if;
  if q = '' or length(q) > 200 then
    raise exception 'Napiš otázku (nejvýš 200 znaků).' using errcode = '22023';
  end if;
  select coalesce(array_agg(t), '{}') into clean
  from (select trim(o) as t from unnest(options) with ordinality as x(o, n) where trim(o) <> '' order by n) s;
  if array_length(clean, 1) is null or array_length(clean, 1) < 2 then
    raise exception 'Anketa potřebuje aspoň dvě možnosti.' using errcode = '22023';
  end if;
  if array_length(clean, 1) > 10 then
    raise exception 'Anketa může mít nejvýš 10 možností.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(clean) o where length(o) > 100) then
    raise exception 'Možnost může mít nejvýš 100 znaků.' using errcode = '22023';
  end if;

  insert into public.messages (conversation_id, author_id, body)
  values (conversation, me, '📊 ' || q)
  returning id into msg;
  insert into public.chat_polls (message_id, conversation_id, author_id, question, multiple)
  values (msg, conversation, me, q, coalesce(multiple, false))
  returning id into poll;
  for i in 1 .. array_length(clean, 1) loop
    insert into public.chat_poll_options (poll_id, label, position) values (poll, clean[i], i);
  end loop;
  return msg;
end;
$$;

/** Hlas v anketě: nahradí moje dosavadní hlasy vybranými možnostmi (prázdné = zrušit hlas). */
create function public.vote_chat_poll(poll uuid, choices uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  p record;
  n int := coalesce(array_length(choices, 1), 0);
begin
  select * into p from public.chat_polls where id = poll for update;
  if p.id is null or not public.is_member() or not public.in_conversation(p.conversation_id) then
    raise exception 'Anketa neexistuje.' using errcode = '22023';
  end if;
  if p.closed_at is not null then
    raise exception 'Anketa je už ukončená.' using errcode = '22023';
  end if;
  if exists (select 1 from public.messages m where m.id = p.message_id and m.deleted_at is not null) then
    raise exception 'Anketa je smazaná.' using errcode = '22023';
  end if;
  if n > 1 and not p.multiple then
    raise exception 'V téhle anketě jde vybrat jen jedna možnost.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(choices) c where not exists (select 1 from public.chat_poll_options o where o.id = c and o.poll_id = poll)) then
    raise exception 'Taková možnost v anketě není.' using errcode = '22023';
  end if;
  delete from public.chat_poll_votes v where v.poll_id = poll and v.user_id = me and not (v.option_id = any (choices));
  insert into public.chat_poll_votes (option_id, user_id, poll_id, conversation_id)
  select distinct c, me, poll, p.conversation_id from unnest(choices) c
  on conflict do nothing;
end;
$$;

/** Ukončí (nebo znovu otevře) anketu: autor, správce skupiny, v Campu i vyučující a admin. */
create function public.close_chat_poll(poll uuid, closed boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  select * into p from public.chat_polls where id = poll;
  if p.id is null or not public.in_conversation(p.conversation_id) then
    raise exception 'Anketa neexistuje.' using errcode = '22023';
  end if;
  if not (
    p.author_id = (select auth.uid())
    or public.is_group_admin(p.conversation_id)
    or (public.is_staff() and exists (select 1 from public.conversations c where c.id = p.conversation_id and c.is_school))
  ) then
    raise exception 'Anketu může ukončit jen ten, kdo ji založil.' using errcode = '42501';
  end if;
  update public.chat_polls set closed_at = case when closed then now() end where id = poll;
end;
$$;

-- Smazaná zpráva s anketou vezme anketu s sebou.
create function public.drop_poll_of_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.chat_polls p where p.message_id = new.id;
  end if;
  return null;
end;
$$;
create trigger drop_poll_of_deleted after update on public.messages
  for each row execute function public.drop_poll_of_deleted();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_polls, public.chat_poll_votes;
  end if;
end;
$$;

revoke execute on function public.drop_poll_of_deleted from public, anon, authenticated;
revoke execute on function public.create_chat_poll, public.vote_chat_poll, public.close_chat_poll from public, anon;
grant execute on function public.create_chat_poll, public.vote_chat_poll, public.close_chat_poll to authenticated;
