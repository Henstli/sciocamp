-- Zmínky přes @ v chatech. Ve zprávě se ukládají jako „@[Jméno](uuid)“.
-- Chat třídy a týmový chat: zmíněný člen dostane oznámení (druh „zminka“).
-- Soukromé zprávy a skupiny: oznámení chodí všem tak jako tak, zmíněný má
-- v nadpisu „… tě zmínil(a)“. Náhledy v oznámeních ukazují „@Jméno“.

/** „@[Eva Nová](uuid)“ → „@Eva Nová“ (pro náhledy a oznámení). */
create function public.mention_plain(body text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(body, ''), '@\[([^]\n]{1,80})\]\([A-Za-z0-9_-]{1,40}\)', '@\1', 'g')
$$;

/** Zmínění lidé (uuid) ve zprávě. */
create function public.mentioned_ids(body text) returns uuid[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct m[1]::uuid), '{}')
  from regexp_matches(coalesce(body, ''), '@\[[^]\n]{1,80}\]\(([0-9a-fA-F-]{36})\)', 'g') as m
$$;

-- Soukromé zprávy a skupiny: hezký náhled a „tě zmínil(a)“ u zmíněných.
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

-- Chat třídy: oznámení zmíněným členům třídy (studenti a vyučující).
create function public.notify_class_mentions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  targets uuid[];
begin
  select coalesce(array_agg(u), '{}') into targets
  from unnest(public.mentioned_ids(new.body)) as u
  where u <> new.author_id
    and (u = any (public.class_students(new.activity_id)) or u = any (public.class_teachers(new.activity_id)));
  if array_length(targets, 1) > 0 then
    perform public.notify(targets, 'zminka',
      public.profile_name(new.author_id) || ' tě zmínil(a) v chatu třídy',
      (select a.title from public.activities a where a.id = new.activity_id) || ': ' || left(public.mention_plain(new.body), 120),
      public.class_href(new.activity_id) || '?tab=chat');
  end if;
  return null;
end;
$$;
create trigger notify_class_mentions after insert on public.class_messages
  for each row execute function public.notify_class_mentions();

-- Týmový chat: oznámení zmíněným členům týmu a vyučujícím třídy.
create function public.notify_team_mentions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  targets uuid[];
begin
  select tm.assignment_id, a.activity_id, a.title into t
  from public.teams tm join public.assignments a on a.id = tm.assignment_id where tm.id = new.team_id;
  select coalesce(array_agg(u), '{}') into targets
  from unnest(public.mentioned_ids(new.body)) as u
  where u <> new.author_id
    and (exists (select 1 from public.team_members m where m.team_id = new.team_id and m.student_id = u)
         or u = any (public.class_teachers(t.activity_id)));
  if array_length(targets, 1) > 0 then
    perform public.notify(targets, 'zminka',
      public.profile_name(new.author_id) || ' tě zmínil(a) v týmovém chatu',
      t.title || ': ' || left(public.mention_plain(new.body), 120),
      '/ukoly/' || t.assignment_id);
  end if;
  return null;
end;
$$;
create trigger notify_team_mentions after insert on public.team_messages
  for each row execute function public.notify_team_mentions();

revoke execute on function public.notify_class_mentions, public.notify_team_mentions from public, anon, authenticated;
