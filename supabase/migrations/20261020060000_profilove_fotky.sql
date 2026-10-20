-- Profilové fotky. Soubor je v soukromém bucketu „avatary“ ve složce
-- <id uživatele>; vidí ho jen přihlášení ve škole (aplikace ho podává přes
-- /api/avatar/<id> s dočasným odkazem). Nahrává a maže si ho každý sám.

alter table public.profiles add column avatar_path text
  check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text);
comment on column public.profiles.avatar_path is 'Cesta k profilové fotce v bucketu avatary (<id>/<čas>.jpg).';

grant update (bio, avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatary', 'avatary', false, 2097152)
on conflict (id) do nothing;

create policy "avatary: členové čtou" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatary' and public.is_member());
create policy "avatary: nahrává každý do své složky" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatary' and public.storage_folder_uuid(name) = (select auth.uid()) and public.is_member());
create policy "avatary: maže každý ze své složky" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatary' and public.storage_folder_uuid(name) = (select auth.uid()));
