-- Akce se zprávami ve všech chatech (Zprávy, chat třídy, týmový chat):
-- odpověď na konkrétní zprávu, úprava vlastní zprávy („upraveno“), smazání
-- vlastní zprávy (už šlo), reakce emoji a připnutí zprávy.
--
-- Druhy chatů: 'zpravy' = public.messages (místnost = conversation_id),
-- 'trida' = public.class_messages (activity_id), 'tym' = public.team_messages (team_id).

-- ---------------------------------------------------------------------------
-- Nové sloupce
-- ---------------------------------------------------------------------------

-- reply_to záměrně bez cizího klíče: po smazání původní zprávy zůstane vidět,
-- že šlo o odpověď („Původní zpráva byla smazána“).
alter table public.messages
  add column reply_to uuid,
  add column edited_at timestamptz,
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles (id) on delete set null;
alter table public.class_messages
  add column reply_to uuid,
  add column edited_at timestamptz,
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles (id) on delete set null;
alter table public.team_messages
  add column reply_to uuid,
  add column edited_at timestamptz,
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles (id) on delete set null;

create index messages_pinned_idx on public.messages (conversation_id) where pinned_at is not null;
create index class_messages_pinned_idx on public.class_messages (activity_id) where pinned_at is not null;
create index team_messages_pinned_idx on public.team_messages (team_id) where pinned_at is not null;

-- ---------------------------------------------------------------------------
-- Pomocné funkce
-- ---------------------------------------------------------------------------

/** Smí přihlášený číst daný chat? */
create function public.chat_room_visible(chat text, room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case chat
    when 'zpravy' then public.in_conversation(room)
    when 'trida' then public.in_class(room)
    when 'tym' then public.is_team_member(room) or public.manages_assignment(public.team_assignment(room))
    else false
  end
$$;

/** Místnost zprávy (konverzace / třída / tým), nebo null, když zpráva není. */
create function public.chat_message_room(chat text, message uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case chat
    when 'zpravy' then (select m.conversation_id from public.messages m where m.id = message and not m.system)
    when 'trida' then (select m.activity_id from public.class_messages m where m.id = message)
    when 'tym' then (select m.team_id from public.team_messages m where m.id = message)
  end
$$;

-- ---------------------------------------------------------------------------
-- Odpovědi: jen na zprávu ze stejného chatu
-- ---------------------------------------------------------------------------

create function public.chat_check_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  chat text := case tg_table_name when 'messages' then 'zpravy' when 'class_messages' then 'trida' else 'tym' end;
  room uuid := case tg_table_name
    when 'messages' then (to_jsonb(new) ->> 'conversation_id')::uuid
    when 'class_messages' then (to_jsonb(new) ->> 'activity_id')::uuid
    else (to_jsonb(new) ->> 'team_id')::uuid
  end;
begin
  if new.reply_to is not null and public.chat_message_room(chat, new.reply_to) is distinct from room then
    raise exception 'Odpovídat jde jen na zprávu ze stejného chatu.' using errcode = '22023';
  end if;
  -- Nová zpráva nemůže přijít rovnou upravená ani připnutá.
  new.edited_at := null;
  new.pinned_at := null;
  new.pinned_by := null;
  return new;
end;
$$;
create trigger chat_check_reply before insert on public.messages
  for each row execute function public.chat_check_reply();
create trigger chat_check_reply before insert on public.class_messages
  for each row execute function public.chat_check_reply();
create trigger chat_check_reply before insert on public.team_messages
  for each row execute function public.chat_check_reply();

-- ---------------------------------------------------------------------------
-- Úprava vlastní zprávy: jde měnit jen text, čas úpravy doplní trigger
-- ---------------------------------------------------------------------------

grant update (body) on public.messages, public.class_messages, public.team_messages to authenticated;

create function public.chat_mark_edited() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create trigger chat_mark_edited before update on public.messages
  for each row execute function public.chat_mark_edited();
create trigger chat_mark_edited before update on public.class_messages
  for each row execute function public.chat_mark_edited();
create trigger chat_mark_edited before update on public.team_messages
  for each row execute function public.chat_mark_edited();

create policy "autor upravuje svou zprávu" on public.messages
  for update to authenticated
  using (author_id = (select auth.uid()) and not system and public.in_conversation(conversation_id))
  with check (author_id = (select auth.uid()) and not system and public.in_conversation(conversation_id));
create policy "autor upravuje svou zprávu" on public.class_messages
  for update to authenticated
  using (author_id = (select auth.uid()) and public.in_class(activity_id))
  with check (author_id = (select auth.uid()) and public.in_class(activity_id));
create policy "autor upravuje svou zprávu" on public.team_messages
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and (public.is_team_member(team_id) or public.manages_assignment(public.team_assignment(team_id)))
  )
  with check (
    author_id = (select auth.uid())
    and (public.is_team_member(team_id) or public.manages_assignment(public.team_assignment(team_id)))
  );

-- ---------------------------------------------------------------------------
-- Připnutí: ve Zprávách kdokoli z konverzace, v chatu třídy vyučující
-- a admin, v týmovém chatu členové týmu a vyučující
-- ---------------------------------------------------------------------------

create function public.pin_chat_message(chat text, message uuid, pin boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  room uuid := public.chat_message_room(chat, message);
  me uuid := (select auth.uid());
  allowed boolean;
begin
  if room is null or not public.is_member() then
    raise exception 'Zpráva neexistuje.' using errcode = '22023';
  end if;
  allowed := case chat
    when 'zpravy' then public.in_conversation(room)
    when 'trida' then public.manages_class(room)
    when 'tym' then public.is_team_member(room) or public.manages_assignment(public.team_assignment(room))
    else false
  end;
  if not allowed then
    raise exception 'Tuhle zprávu připnout nemůžeš.' using errcode = '42501';
  end if;
  if chat = 'zpravy' then
    update public.messages set pinned_at = case when pin then now() end, pinned_by = case when pin then me end where id = message;
  elsif chat = 'trida' then
    update public.class_messages set pinned_at = case when pin then now() end, pinned_by = case when pin then me end where id = message;
  else
    update public.team_messages set pinned_at = case when pin then now() end, pinned_by = case when pin then me end where id = message;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reakce
-- ---------------------------------------------------------------------------

create table public.chat_reactions (
  chat text not null check (chat in ('zpravy', 'trida', 'tym')),
  -- Doplní trigger podle zprávy (konverzace / třída / tým); slouží pro RLS a Realtime filtr.
  room uuid not null,
  message_id uuid not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index chat_reactions_room_idx on public.chat_reactions (room);

create function public.chat_reaction_room() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.room := public.chat_message_room(new.chat, new.message_id);
  if new.room is null then
    raise exception 'Zpráva neexistuje.' using errcode = '22023';
  end if;
  if (select count(*) from public.chat_reactions r where r.message_id = new.message_id and r.user_id = new.user_id) >= 8 then
    raise exception 'Na jednu zprávu dej nejvýš 8 reakcí.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger chat_reaction_room before insert on public.chat_reactions
  for each row execute function public.chat_reaction_room();

alter table public.chat_reactions enable row level security;
grant select, insert, delete on public.chat_reactions to authenticated;

create policy "chat vidí reakce" on public.chat_reactions
  for select to authenticated using (public.chat_room_visible(chat, room));
create policy "člen chatu reaguje" on public.chat_reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member() and public.chat_room_visible(chat, room));
create policy "autor ruší svou reakci" on public.chat_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Smazaná zpráva (i při smazání celé konverzace, třídy nebo týmu) vezme reakce s sebou.
create function public.chat_drop_reactions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.chat_reactions r where r.message_id = old.id;
  return null;
end;
$$;
create trigger chat_drop_reactions after delete on public.messages
  for each row execute function public.chat_drop_reactions();
create trigger chat_drop_reactions after delete on public.class_messages
  for each row execute function public.chat_drop_reactions();
create trigger chat_drop_reactions after delete on public.team_messages
  for each row execute function public.chat_drop_reactions();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_reactions;
  end if;
end;
$$;

revoke execute on function public.chat_check_reply, public.chat_mark_edited, public.chat_reaction_room, public.chat_drop_reactions
  from public, anon, authenticated;
revoke execute on function public.chat_message_room from public, anon, authenticated;
revoke execute on function public.chat_room_visible, public.pin_chat_message from public, anon;
grant execute on function public.chat_room_visible, public.pin_chat_message to authenticated;
