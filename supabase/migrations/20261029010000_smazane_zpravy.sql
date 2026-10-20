-- Smazaná zpráva nezmizí beze stopy: v chatu zůstane „X zprávu smazal(a)“.
-- Text a příloha se vymažou (soubor pak uklidí noční úklid úložiště),
-- reakce a připnutí zmizí. Mazat jde jen přes RPC delete_chat_message.

alter table public.messages
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id) on delete set null;
alter table public.class_messages
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id) on delete set null;
alter table public.team_messages
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id) on delete set null;

-- Smazaná zpráva je prázdná (bez textu i přílohy).
alter table public.messages drop constraint if exists messages_check;
alter table public.messages add constraint messages_content
  check (deleted_at is not null or length(trim(body)) > 0 or file_path is not null);
alter table public.class_messages drop constraint if exists class_messages_content;
alter table public.class_messages add constraint class_messages_content
  check (deleted_at is not null or length(trim(body)) > 0 or file_path is not null);
alter table public.team_messages drop constraint if exists team_messages_check;
alter table public.team_messages add constraint team_messages_content
  check (deleted_at is not null or length(trim(body)) > 0 or file_path is not null);

-- Napřímo mazat už nejde (zpráva by zmizela beze stopy); celé konverzace,
-- třídy a týmy dál mažou svoje funkce a kaskády.
revoke delete on public.messages, public.class_messages, public.team_messages from authenticated;

-- Na smazanou zprávu nejde odpovědět, reagovat ani ji připnout.
create or replace function public.chat_message_room(chat text, message uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case chat
    when 'zpravy' then (select m.conversation_id from public.messages m where m.id = message and not m.system and m.deleted_at is null)
    when 'trida' then (select m.activity_id from public.class_messages m where m.id = message and m.deleted_at is null)
    when 'tym' then (select m.team_id from public.team_messages m where m.id = message and m.deleted_at is null)
  end
$$;

/**
 * Smaže zprávu: vlastní kdokoli, v chatu třídy a týmu i cizí vyučující
 * třídy a admin. Zůstane jen záznam, kdo a kdy ji smazal.
 */
create function public.delete_chat_message(chat text, message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  author uuid;
  room uuid := public.chat_message_room(chat, message);
  allowed boolean;
begin
  if room is null or not public.is_member() then
    raise exception 'Zpráva neexistuje nebo už je smazaná.' using errcode = '22023';
  end if;
  author := case chat
    when 'zpravy' then (select m.author_id from public.messages m where m.id = message)
    when 'trida' then (select m.author_id from public.class_messages m where m.id = message)
    else (select m.author_id from public.team_messages m where m.id = message)
  end;
  allowed := case chat
    when 'zpravy' then author = me and public.in_conversation(room)
    when 'trida' then (author = me and public.in_class(room)) or public.manages_class(room)
    when 'tym' then (author = me and public.chat_room_visible('tym', room)) or public.manages_assignment(public.team_assignment(room))
    else false
  end;
  if not coalesce(allowed, false) then
    raise exception 'Tuhle zprávu smazat nemůžeš.' using errcode = '42501';
  end if;
  if chat = 'zpravy' then
    update public.messages
    set body = '', file_path = null, file_name = null, file_size = null,
        pinned_at = null, pinned_by = null, deleted_at = now(), deleted_by = me
    where id = message;
  elsif chat = 'trida' then
    update public.class_messages
    set body = '', file_path = null, file_name = null, file_size = null,
        pinned_at = null, pinned_by = null, deleted_at = now(), deleted_by = me
    where id = message;
  else
    update public.team_messages
    set body = '', file_path = null, file_name = null, file_size = null,
        pinned_at = null, pinned_by = null, deleted_at = now(), deleted_by = me
    where id = message;
  end if;
  delete from public.chat_reactions r where r.message_id = message;
end;
$$;

-- Smazanou zprávu nejde upravit (vrátil by se text). Samotné smazání
-- (delete_chat_message mění i body) se za úpravu nepočítá.
create or replace function public.chat_mark_edited() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;
  if new.body is distinct from old.body then
    if old.deleted_at is not null then
      raise exception 'Smazanou zprávu nejde upravit.' using errcode = '22023';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.delete_chat_message from public, anon;
grant execute on function public.delete_chat_message to authenticated;
