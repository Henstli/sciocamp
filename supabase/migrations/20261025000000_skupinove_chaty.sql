-- Skupinové chaty ve Zprávách.
-- Skupina = konverzace s is_group a názvem (bez pair_key). Členové mohou být
-- správci (is_admin): přejmenují skupinu, přidají a vyhodí členy, udělají
-- člena správcem a skupinu smažou. Každý může skupinu opustit; když odejde
-- poslední správce, stane se správcem nejdéle přítomný člen.
-- Změny ve skupině se v chatu ukazují jako systémové zprávy (messages.system).

alter table public.conversations
  alter column pair_key drop not null,
  add column is_group boolean not null default false,
  add column title text,
  add column created_by uuid references public.profiles (id) on delete set null,
  add constraint conversations_group_shape check (
    (is_group and pair_key is null and title is not null and length(trim(title)) between 1 and 60)
    or (not is_group and pair_key is not null)
  );

alter table public.conversation_members
  add column is_admin boolean not null default false,
  add column joined_at timestamptz not null default now();

alter table public.messages add column system boolean not null default false;

/** Systémové zprávy smí zakládat jen funkce v databázi, ne uživatelé přímo. */
create function public.messages_no_user_system() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    new.system := false;
  end if;
  return new;
end;
$$;
create trigger messages_no_user_system before insert on public.messages
  for each row execute function public.messages_no_user_system();

create function public.is_group_admin(conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and exists (
    select 1 from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id
    where c.id = conversation and c.is_group and m.user_id = (select auth.uid()) and m.is_admin
  )
$$;

/** Systémová zpráva do skupiny (autor = kdo akci udělal). */
create function public.group_event(conversation uuid, actor uuid, text_ text) returns void
language sql security definer set search_path = '' as $$
  insert into public.messages (conversation_id, author_id, body, system)
  values (conversation, actor, text_, true)
$$;

/** Ověří seznam lidí pro skupinu (existují, nejsou zablokovaní). */
create function public.group_people(people uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from public.profiles p
  where p.id = any (people) and not p.blocked
$$;

/** Založí skupinu: zakladatel je správce, ostatní členové. */
create function public.create_group(title text, members uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  name_ text := trim(coalesce(title, ''));
  people uuid[];
  conv uuid;
begin
  if not public.is_member() then
    raise exception 'Nejsi přihlášený.' using errcode = 'insufficient_privilege';
  end if;
  if length(name_) not between 1 and 60 then
    raise exception 'Skupina potřebuje název (nejvýš 60 znaků).' using errcode = 'invalid_parameter_value';
  end if;
  people := array_remove(public.group_people(members), me);
  if coalesce(array_length(people, 1), 0) < 2 then
    raise exception 'Do skupiny vyber aspoň dva další lidi.' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.conversations (is_group, title, created_by) values (true, name_, me) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id, is_admin) values (conv, me, true);
  insert into public.conversation_members (conversation_id, user_id) select conv, unnest(people);
  perform public.group_event(conv, me, public.profile_name(me) || ' založil(a) skupinu „' || name_ || '“');
  perform public.notify(people, 'zprava', 'Přidali tě do skupiny', name_, '/zpravy?k=' || conv);
  return conv;
end;
$$;

create function public.rename_group(conversation uuid, title text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  name_ text := trim(coalesce(title, ''));
begin
  if not public.is_group_admin(conversation) then
    raise exception 'Skupinu může přejmenovat jen správce.' using errcode = 'insufficient_privilege';
  end if;
  if length(name_) not between 1 and 60 then
    raise exception 'Skupina potřebuje název (nejvýš 60 znaků).' using errcode = 'invalid_parameter_value';
  end if;
  update public.conversations c set title = name_ where c.id = conversation and c.title is distinct from name_;
  if found then
    perform public.group_event(conversation, (select auth.uid()), public.profile_name((select auth.uid())) || ' přejmenoval(a) skupinu na „' || name_ || '“');
  end if;
end;
$$;

create function public.add_group_members(conversation uuid, members uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  added uuid[];
begin
  if not public.is_group_admin(conversation) then
    raise exception 'Členy může přidávat jen správce.' using errcode = 'insufficient_privilege';
  end if;
  with ins as (
    insert into public.conversation_members (conversation_id, user_id)
    select conversation, unnest(public.group_people(members))
    on conflict do nothing
    returning user_id
  )
  select array_agg(user_id) into added from ins;
  if added is not null then
    perform public.group_event(conversation, me, public.profile_name(me) || ' přidal(a) do skupiny: ' ||
      (select string_agg(public.profile_name(u), ', ') from unnest(added) u));
    perform public.notify(added, 'zprava', 'Přidali tě do skupiny',
      (select c.title from public.conversations c where c.id = conversation), '/zpravy?k=' || conversation);
  end if;
end;
$$;

/** Když ve skupině nezůstal správce, stane se jím nejdéle přítomný člen. */
create function public.ensure_group_admin(conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  heir uuid;
begin
  if exists (select 1 from public.conversation_members m where m.conversation_id = conversation and m.is_admin) then
    return;
  end if;
  select m.user_id into heir from public.conversation_members m
  where m.conversation_id = conversation order by m.joined_at, m.user_id limit 1;
  if heir is not null then
    update public.conversation_members m set is_admin = true where m.conversation_id = conversation and m.user_id = heir;
    perform public.group_event(conversation, heir, public.profile_name(heir) || ' je teď správce skupiny');
  end if;
end;
$$;

create function public.remove_group_member(conversation uuid, member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if not public.is_group_admin(conversation) then
    raise exception 'Členy může odebírat jen správce.' using errcode = 'insufficient_privilege';
  end if;
  if member = me then
    raise exception 'Sám sebe odebereš tlačítkem Opustit skupinu.' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.conversation_members m where m.conversation_id = conversation and m.user_id = member;
  if found then
    perform public.group_event(conversation, me, public.profile_name(me) || ' odebral(a) ze skupiny: ' || public.profile_name(member));
  end if;
end;
$$;

create function public.set_group_admin(conversation uuid, member uuid, admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if not public.is_group_admin(conversation) then
    raise exception 'Správce může jmenovat jen správce.' using errcode = 'insufficient_privilege';
  end if;
  if not admin and not exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conversation and m.is_admin and m.user_id <> member
  ) then
    raise exception 'Skupina musí mít aspoň jednoho správce.' using errcode = 'invalid_parameter_value';
  end if;
  update public.conversation_members m set is_admin = admin
  where m.conversation_id = conversation and m.user_id = member and m.is_admin <> admin;
  if found then
    perform public.group_event(conversation, me, case when admin
      then public.profile_name(me) || ' udělal(a) správcem: ' || public.profile_name(member)
      else public.profile_name(me) || ' odebral(a) správcovství: ' || public.profile_name(member) end);
  end if;
end;
$$;

create function public.leave_group(conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.conversations c where c.id = conversation and c.is_group)
    or not public.in_conversation(conversation) then
    raise exception 'V téhle skupině nejsi.' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.conversation_members m where m.conversation_id = conversation and m.user_id = me;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = conversation) then
    delete from public.conversations c where c.id = conversation;
    return;
  end if;
  perform public.group_event(conversation, me, public.profile_name(me) || ' opustil(a) skupinu');
  perform public.ensure_group_admin(conversation);
end;
$$;

/** Smaže skupinu i se zprávami (přílohy uklidí noční úklid úložiště). */
create function public.delete_group(conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_admin(conversation) then
    raise exception 'Skupinu může smazat jen správce.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.notifications n where n.href = '/zpravy?k=' || conversation;
  delete from public.conversations c where c.id = conversation;
end;
$$;

/** Moje konverzace (dvojice i skupiny) s poslední zprávou a počtem nepřečtených. */
create function public.my_chats()
returns table (
  conversation_id uuid,
  is_group boolean,
  title text,
  other_id uuid,
  member_count integer,
  last_message_at timestamptz,
  last_body text,
  last_author uuid,
  last_has_file boolean,
  last_system boolean,
  unread integer
)
language sql stable security invoker set search_path = '' as $$
  select
    c.id,
    c.is_group,
    c.title,
    case when c.is_group then null else (
      select o.user_id from public.conversation_members o where o.conversation_id = c.id and o.user_id <> me.user_id limit 1
    ) end,
    (select count(*)::int from public.conversation_members x where x.conversation_id = c.id),
    c.last_message_at,
    lm.body,
    lm.author_id,
    lm.file_path is not null,
    coalesce(lm.system, false),
    (select count(*)::int from public.messages x
      where x.conversation_id = c.id and x.author_id <> me.user_id and not x.system and x.created_at > me.last_read_at)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select m.body, m.author_id, m.file_path, m.system from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
    and (c.is_group or exists (select 1 from public.messages m where m.conversation_id = c.id))
  order by c.last_message_at desc
$$;

-- Notifikace: ve skupině název skupiny a „Jméno: zpráva“; systémové zprávy bez notifikace.
create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  link text := '/zpravy?k=' || new.conversation_id;
  preview text := coalesce(nullif(left(new.body, 140), ''), 'Poslal(a) přílohu: ' || coalesce(new.file_name, 'soubor'));
  conv record;
  recipient uuid;
begin
  if new.system then
    return null;
  end if;
  select c.is_group, c.title into conv from public.conversations c where c.id = new.conversation_id;
  for recipient in
    select m.user_id from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.user_id <> new.author_id
  loop
    delete from public.notifications n
    where n.user_id = recipient and n.kind = 'zprava' and n.href = link and n.read_at is null;
    insert into public.notifications (user_id, kind, title, body, href)
    values (
      recipient, 'zprava',
      case when conv.is_group then conv.title else 'Nová zpráva od ' || public.profile_name(new.author_id) end,
      case when conv.is_group then public.profile_name(new.author_id) || ': ' || preview else preview end,
      link
    );
  end loop;
  return null;
end;
$$;

revoke execute on function public.messages_no_user_system, public.group_event, public.group_people, public.ensure_group_admin
  from public, anon, authenticated;
revoke execute on function public.create_group, public.rename_group, public.add_group_members, public.remove_group_member,
  public.set_group_admin, public.leave_group, public.delete_group, public.my_chats, public.is_group_admin
  from public, anon;
grant execute on function public.create_group, public.rename_group, public.add_group_members, public.remove_group_member,
  public.set_group_admin, public.leave_group, public.delete_group, public.my_chats, public.is_group_admin
  to authenticated;
