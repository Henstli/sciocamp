-- Soubory, které k úkolu nebo materiálu přikládá vyučující (podklady, prezentace…).
-- Cesta: <id úkolu>/<čas>-<název souboru>
-- Nahrává a maže vyučující třídy a admin, číst je smí i zapsaní studenti.

insert into storage.buckets (id, name, public, file_size_limit)
values ('materialy', 'materialy', false, 26214400) -- 25 MB
on conflict (id) do nothing;

create policy "materiály: vyučující nahrává" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'materialy'
    and public.manages_assignment(public.submission_folder_assignment(name))
  );

create policy "materiály: vyučující mění" on storage.objects
  for update to authenticated
  using (bucket_id = 'materialy' and public.manages_assignment(public.submission_folder_assignment(name)))
  with check (bucket_id = 'materialy' and public.manages_assignment(public.submission_folder_assignment(name)));

create policy "materiály: vyučující maže" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'materialy'
    and public.manages_assignment(public.submission_folder_assignment(name))
  );

create policy "materiály: kdo čte" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'materialy'
    and (
      public.manages_assignment(public.submission_folder_assignment(name))
      or public.in_assignment_class(public.submission_folder_assignment(name))
    )
  );
