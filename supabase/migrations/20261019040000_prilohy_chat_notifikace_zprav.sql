-- Přílohy v chatu třídy a notifikace o nových soukromých zprávách.

-- ---------------------------------------------------------------------------
-- Chat třídy: soubory a obrázky (bucket „chat“, složka = uuid třídy)
-- ---------------------------------------------------------------------------

alter table public.class_messages
  add column file_path text,
  add column file_name text,
  add column file_size bigint;

alter table public.class_messages drop constraint class_messages_body_check;
alter table public.class_messages
  add constraint class_messages_body_check check (length(body) <= 2000),
  add constraint class_messages_content check (length(trim(body)) > 0 or file_path is not null),
  add constraint class_messages_file_folder check (file_path is null or split_part(file_path, '/', 1) = activity_id::text);
alter table public.class_messages alter column body set default '';

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat', 'chat', false, 26214400)
on conflict (id) do nothing;

create policy "chat: třída nahrává" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat' and public.in_class(public.storage_folder_uuid(name)));
create policy "chat: třída čte" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat' and public.in_class(public.storage_folder_uuid(name)));
create policy "chat: autor nebo vyučující maže" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat'
    and ((owner_id = (select auth.uid())::text) or public.manages_class(public.storage_folder_uuid(name)))
  );

-- ---------------------------------------------------------------------------
-- Nová soukromá zpráva → notifikace příjemci. Na jednu konverzaci drží jen
-- jednu nepřečtenou notifikaci (starší nahradí), aby zvoneček nezahltila.
-- ---------------------------------------------------------------------------

create function public.notify_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  link text := '/zpravy?k=' || new.conversation_id;
  preview text := coalesce(nullif(left(new.body, 140), ''), 'Poslal(a) ti přílohu: ' || coalesce(new.file_name, 'soubor'));
  recipient uuid;
begin
  for recipient in
    select m.user_id from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.user_id <> new.author_id
  loop
    delete from public.notifications n
    where n.user_id = recipient and n.kind = 'zprava' and n.href = link and n.read_at is null;
    insert into public.notifications (user_id, kind, title, body, href)
    values (recipient, 'zprava', 'Nová zpráva od ' || public.profile_name(new.author_id), preview, link);
  end loop;
  return null;
end;
$$;
create trigger notify_message after insert on public.messages
  for each row execute function public.notify_message();

revoke execute on function public.notify_message from public, anon, authenticated;
