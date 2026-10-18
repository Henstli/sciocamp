-- Soubory odevzdaných prací ve Storage. Cesta: <id úkolu>/<id studenta>/<název souboru>
-- Student nahrává a maže jen ve své složce (a jen dokud práce není ohodnocená),
-- vyučující třídy a admin soubory čtou.

insert into storage.buckets (id, name, public, file_size_limit)
values ('odevzdani', 'odevzdani', false, 26214400) -- 25 MB
on conflict (id) do nothing;

create function public.submission_folder_owner(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(object_name))[2] = (select auth.uid())::text
$$;

create function public.submission_folder_assignment(object_name text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  return ((storage.foldername(object_name))[1])::uuid;
exception when others then
  return null;
end;
$$;

create policy "odevzdání: student nahrává do své složky" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'odevzdani'
    and public.submission_folder_owner(name)
    and public.in_assignment_class(public.submission_folder_assignment(name))
    and not public.is_review_final(public.submission_folder_assignment(name), (select auth.uid()))
  );

create policy "odevzdání: student maže ze své složky" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'odevzdani'
    and public.submission_folder_owner(name)
    and not public.is_review_final(public.submission_folder_assignment(name), (select auth.uid()))
  );

create policy "odevzdání: kdo čte soubory" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'odevzdani'
    and (
      (public.submission_folder_owner(name) and public.is_member())
      or public.manages_assignment(public.submission_folder_assignment(name))
    )
  );

revoke execute on function public.submission_folder_owner, public.submission_folder_assignment from public, anon;
grant execute on function public.submission_folder_owner, public.submission_folder_assignment to authenticated;
