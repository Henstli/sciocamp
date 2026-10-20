-- Celoškolní chat „Celá škola“: skupina ve Zprávách, ve které je každý
-- (i lidé přidaní později). Odejít z ní ani nikoho vyhodit nejde, smazat ani
-- přejmenovat taky ne. Kvůli počtu lidí nechodí do zvonečku každá zpráva,
-- jen zmínka přes @. Připínat a mazat cizí zprávy smí vyučující a admin.

alter table public.conversations add column is_school boolean not null default false;
create unique index conversations_one_school on public.conversations (is_school) where is_school;

insert into public.conversations (is_group, is_school, title)
values (true, true, 'Celá škola');

insert into public.conversation_members (conversation_id, user_id)
select c.id, p.id
from public.conversations c cross join public.profiles p
where c.is_school
on conflict do nothing;

/** Id celoškolního chatu. */
create function public.school_chat_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.conversations c where c.is_school limit 1
$$;

-- Nový člověk ve škole je hned i v celoškolním chatu.
create function public.join_school_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversation_members (conversation_id, user_id)
  select c.id, new.id from public.conversations c where c.is_school
  on conflict do nothing;
  return null;
end;
$$;
create trigger join_school_chat after insert on public.profiles
  for each row execute function public.join_school_chat();

-- Z celoškolního chatu nejde odejít ani nikoho odebrat (při smazání účtu
-- je profil už pryč a člen zmizí normálně).
create function public.keep_school_members() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.conversations c where c.id = old.conversation_id and c.is_school)
    and exists (select 1 from public.profiles p where p.id = old.user_id) then
    raise exception 'Z celoškolního chatu nejde odejít ani nikoho odebrat.' using errcode = '42501';
  end if;
  return old;
end;
$$;
create trigger keep_school_members before delete on public.conversation_members
  for each row execute function public.keep_school_members();

-- Celoškolní chat nejde smazat, přejmenovat ani z něj udělat běžnou skupinu.
create function public.keep_school_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_school then
      raise exception 'Celoškolní chat nejde smazat.' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.is_school and (new.title is distinct from old.title or not new.is_school or not new.is_group) then
    raise exception 'Celoškolní chat nejde přejmenovat.' using errcode = '42501';
  end if;
  if new.is_school and not old.is_school then
    raise exception 'Celoškolní chat je jen jeden.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger keep_school_chat before update or delete on public.conversations
  for each row execute function public.keep_school_chat();

-- Oznámení: v celoškolním chatu jen zmíněným (jinak jako dřív).
create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  link text := '/zpravy?k=' || new.conversation_id;
  preview text := coalesce(nullif(left(public.mention_plain(new.body), 140), ''), 'Poslal(a) přílohu: ' || coalesce(new.file_name, 'soubor'));
  mentioned uuid[] := public.mentioned_ids(new.body);
  conv record;
  recipient uuid;
begin
  if new.system then
    return null;
  end if;
  select c.is_group, c.is_school, c.title into conv from public.conversations c where c.id = new.conversation_id;
  for recipient in
    select m.user_id from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.user_id <> new.author_id
      and (not conv.is_school or m.user_id = any (mentioned))
  loop
    delete from public.notifications n
    where n.user_id = recipient and n.kind = 'zprava' and n.href = link and n.read_at is null;
    insert into public.notifications (user_id, kind, title, body, href)
    values (
      recipient, case when conv.is_school then 'zminka' else 'zprava' end,
      case
        when recipient = any (mentioned) and conv.is_group then public.profile_name(new.author_id) || ' tě zmínil(a) · ' || conv.title
        when conv.is_group then conv.title
        else 'Nová zpráva od ' || public.profile_name(new.author_id)
      end,
      case when conv.is_group then public.profile_name(new.author_id) || ': ' || preview else preview end,
      link
    );
  end loop;
  return null;
end;
$$;

-- Připnout v celoškolním chatu smí jen vyučující a admin.
create or replace function public.pin_chat_message(chat text, message uuid, pin boolean) returns void
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
      and (public.is_staff() or not exists (select 1 from public.conversations c where c.id = room and c.is_school))
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

-- Mazat cizí zprávy v celoškolním chatu smí vyučující a admin.
create or replace function public.delete_chat_message(chat text, message uuid) returns void
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
    when 'zpravy' then public.in_conversation(room) and (
      author = me
      or (public.is_staff() and exists (select 1 from public.conversations c where c.id = room and c.is_school))
    )
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

revoke execute on function public.join_school_chat, public.keep_school_members, public.keep_school_chat
  from public, anon, authenticated;
revoke execute on function public.school_chat_id from public, anon;
grant execute on function public.school_chat_id to authenticated;
