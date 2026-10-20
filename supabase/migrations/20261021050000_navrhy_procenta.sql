-- Návrhy: hlasování pro / proti / je mi to jedno a práh v procentech celé školy.
--
-- Autor navrhne, kolik procent všech lidí ve škole (studenti, učitelé, admini,
-- bez zablokovaných) musí být pro; vyučující práh potvrdí nebo upraví.
-- Hlasy jsou anonymní: každý vidí jen svůj, počty jsou v proposals.
-- (Tabulka proposals byla při změně prázdná.)

alter table public.proposals rename column need_proposed to need_percent_proposed;
alter table public.proposals rename column need to need_percent;
alter table public.proposals rename column support_count to pro_count;
alter table public.proposals
  add column against_count integer not null default 0,
  add column neutral_count integer not null default 0,
  add constraint proposals_need_percent_proposed_range check (need_percent_proposed between 1 and 100),
  add constraint proposals_need_percent_range check (need_percent between 1 and 100);
comment on column public.proposals.need_percent_proposed is 'Kolik % školy má být pro (navrhl autor).';
comment on column public.proposals.need_percent is 'Kolik % školy má být pro (potvrdil vyučující; null = čeká).';

-- Oblasti podle online školy (bez vlastní budovy).
alter table public.proposals drop constraint proposals_category_check;
alter table public.proposals add constraint proposals_category_check
  check (category in ('kurzy', 'ateliery', 'rozvrh', 'online', 'expedice', 'komunita', 'pravidla', 'jine'));

-- Hlas: pro / proti / jedno.
alter table public.proposal_supports
  add column choice text not null default 'pro' check (choice in ('pro', 'proti', 'jedno'));
grant update (choice) on public.proposal_supports to authenticated;
create policy "hlas k návrhu: změnit svůj u otevřeného" on public.proposal_supports for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.proposals p where p.id = proposal_id and p.status = 'open' and p.author_id <> proposal_supports.user_id)
  )
  with check (user_id = (select auth.uid()));
-- Anonymita: kdo jak hlasoval, nevidí nikdo jiný (omezující politika vedle původní).
create policy "hlas k návrhu: vidí každý jen svůj" on public.proposal_supports as restrictive for select to authenticated
  using (user_id = (select auth.uid()));

/** Kolik lidí ve škole může hlasovat (všichni nezablokovaní). */
create function public.member_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.profiles where not blocked
$$;
revoke execute on function public.member_count from public, anon;
grant execute on function public.member_count to authenticated;

/** Přepočítá hlasy; při prvním dosažení prahu pošle oznámení autorovi a vyučujícím. */
create or replace function public.proposal_recount(proposal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
  n_pro integer;
  n_against integer;
  n_neutral integer;
  members integer := public.member_count();
begin
  select count(*) filter (where choice = 'pro'), count(*) filter (where choice = 'proti'), count(*) filter (where choice = 'jedno')
  into n_pro, n_against, n_neutral
  from public.proposal_supports where proposal_id = proposal;
  update public.proposals set pro_count = n_pro, against_count = n_against, neutral_count = n_neutral
  where id = proposal returning * into p;
  if p.id is null or p.status <> 'open' or p.need_percent is null or p.reached_at is not null
     or n_pro * 100 < p.need_percent * members then
    return;
  end if;
  update public.proposals set reached_at = now() where id = proposal;
  perform public.notify(
    array[p.author_id],
    'navrh',
    'Tvůj návrh má dost podpory',
    p.title || case when p.goal = 'shromazdeni' then ' — půjde na shromáždění.' else ' — vyučující ho teď posoudí.' end,
    '/navrhy/' || p.id
  );
  perform public.notify(
    (select array_agg(id) from public.profiles where role in ('ucitel', 'admin') and not blocked),
    'navrh',
    case when p.goal = 'shromazdeni' then 'Návrh na shromáždění' else 'Návrh čeká na rozhodnutí' end,
    p.title || ' (pro ' || round(n_pro * 100.0 / greatest(members, 1)) || ' % školy)',
    '/navrhy/' || p.id
  );
end;
$$;

drop trigger proposal_support_count on public.proposal_supports;
create trigger proposal_support_count after insert or delete or update of choice on public.proposal_supports
  for each row execute function public.after_proposal_support();

create or replace function public.after_proposal_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.proposal_supports (proposal_id, user_id, choice) values (new.id, new.author_id, 'pro')
  on conflict do nothing;
  perform public.notify(
    (select array_agg(id) from public.profiles where role in ('ucitel', 'admin') and not blocked),
    'navrh',
    'Nový návrh: potvrď práh',
    new.title || ' — autor navrhuje ' || new.need_percent_proposed || ' % školy pro.',
    '/navrhy/' || new.id
  );
  return null;
end;
$$;

/** Vyučující nebo admin potvrdí / upraví práh (procenta školy, která mají být pro). */
create or replace function public.set_proposal_need(proposal uuid, n integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
begin
  if not public.is_staff() then
    raise exception 'Práh potvrzuje vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  if n is null or n < 1 or n > 100 then
    raise exception 'Práh musí být 1 až 100 procent.' using errcode = 'check_violation';
  end if;
  update public.proposals set need_percent = n, need_set_by = auth.uid(),
    reached_at = case when pro_count * 100 >= n * public.member_count() then reached_at else null end
  where id = proposal and status = 'open'
  returning * into p;
  if p.id is null then
    raise exception 'Návrh už je uzavřený.' using errcode = 'check_violation';
  end if;
  perform public.notify(
    array[p.author_id], 'navrh',
    case when n = p.need_percent_proposed then 'Práh potvrzen' else 'Práh upraven' end,
    p.title || ' — potřeba ' || n || ' % školy pro.',
    '/navrhy/' || p.id
  );
  perform public.proposal_recount(proposal);
end;
$$;

-- Výsledek dostanou všichni, kdo hlasovali pro (a autor).
create or replace function public.proposal_people(proposal uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(s.user_id), '{}') from public.proposal_supports s
  where s.proposal_id = proposal and s.choice = 'pro'
$$;
