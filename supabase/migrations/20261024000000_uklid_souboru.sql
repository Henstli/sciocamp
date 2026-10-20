-- Úklid úložiště: soubory, na které už nic v databázi neodkazuje
-- (smazaná zpráva, příspěvek, úkol, tým, vyměněná profilovka…).
-- Funkce jen vrací seznam; mazání dělá server přes Storage API (SQL mazat ze storage nesmí).
-- Soubory mladší než min_age se vynechají — mohou se zrovna nahrávat (příspěvek se uloží až po nahrání příloh).

create or replace function public.storage_orphans(min_age interval default interval '1 day')
returns table (bucket text, path text, size bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.created_at < now() - min_age
    and o.name not like '%.emptyFolderPlaceholder'
    and case o.bucket_id
      when 'avatary' then not exists (select 1 from public.profiles p where p.avatar_path = o.name)
      when 'zpravy' then not exists (select 1 from public.messages m where m.file_path = o.name)
      when 'chat' then not exists (select 1 from public.class_messages m where m.file_path = o.name)
      when 'tymy' then not exists (select 1 from public.team_messages m where m.file_path = o.name)
      when 'prispevky' then not exists (
        select 1 from public.posts p, jsonb_array_elements(p.files) f where f->>'path' = o.name)
      -- materialy/<id úkolu>/<soubor>
      when 'materialy' then not exists (
        select 1 from public.assignments a where a.id::text = split_part(o.name, '/', 1))
      -- odevzdani/<id úkolu>/<id studenta nebo týmu>/<soubor>
      when 'odevzdani' then
        not exists (select 1 from public.assignments a where a.id::text = split_part(o.name, '/', 1))
        or not (
          exists (select 1 from public.profiles p where p.id::text = split_part(o.name, '/', 2))
          or exists (select 1 from public.teams t where t.id::text = split_part(o.name, '/', 2))
        )
      else false
    end
$$;

revoke all on function public.storage_orphans(interval) from public, anon, authenticated;
grant execute on function public.storage_orphans(interval) to service_role;

-- Přehled obsazeného místa po složkách (pro Správu).
create or replace function public.storage_usage()
returns table (bucket text, files bigint, bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, count(*), coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o
  where o.name not like '%.emptyFolderPlaceholder'
  group by o.bucket_id
$$;

revoke all on function public.storage_usage() from public, anon, authenticated;
grant execute on function public.storage_usage() to service_role;
