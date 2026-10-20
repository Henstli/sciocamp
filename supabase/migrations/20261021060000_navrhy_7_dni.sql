-- Návrhy: hlasuje se 7 dní od podání. Kdo do té doby nezíská dost hlasů pro,
-- skončí jako „neproslo“. Uzavřené návrhy zůstávají v historii, dokud je
-- admin nesmaže (aplikace po něm chce potvrzení, že byl návrh uskutečněn
-- nebo řádně zapsán).

alter table public.proposals add column voting_ends_at timestamptz;
update public.proposals set voting_ends_at = created_at + interval '7 days';
alter table public.proposals
  alter column voting_ends_at set default now() + interval '7 days',
  alter column voting_ends_at set not null;
comment on column public.proposals.voting_ends_at is 'Do kdy se o návrhu hlasuje (7 dní od podání).';

alter table public.proposals drop constraint proposals_status_check;
alter table public.proposals add constraint proposals_status_check
  check (status in ('open', 'projednano', 'schvaleno', 'zamitnuto', 'stazeno', 'neproslo'));

-- Po konci hlasování se hlas nedá přidat, změnit ani odebrat (omezující politiky vedle původních).
create policy "hlas k návrhu: jen během hlasování (přidat)" on public.proposal_supports as restrictive
  for insert to authenticated
  with check (exists (select 1 from public.proposals p where p.id = proposal_id and p.voting_ends_at > now()));
create policy "hlas k návrhu: jen během hlasování (změnit)" on public.proposal_supports as restrictive
  for update to authenticated
  using (exists (select 1 from public.proposals p where p.id = proposal_id and p.voting_ends_at > now()));
create policy "hlas k návrhu: jen během hlasování (odebrat)" on public.proposal_supports as restrictive
  for delete to authenticated
  using (exists (select 1 from public.proposals p where p.id = proposal_id and p.voting_ends_at > now()));

/**
 * Uzavře návrhy, kterým skončilo hlasování a nemají dost hlasů pro
 * (práh potvrzený vyučujícím, jinak navržený autorem). Spouští ji aplikace
 * při otevření Návrhů; smí kdokoli přihlášený (mění jen prošlé).
 */
create function public.close_expired_proposals() returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
  members integer := public.member_count();
begin
  for p in
    update public.proposals
    set status = 'neproslo', resolution = 'Za 7 dní návrh nezískal dost hlasů pro.', resolved_at = now()
    where status = 'open' and voting_ends_at <= now()
      and pro_count * 100 < coalesce(need_percent, need_percent_proposed) * members
    returning *
  loop
    perform public.notify(
      public.proposal_people(p.id), 'navrh', 'Návrh neprošel: ' || p.title,
      'Hlasování skončilo bez dost hlasů pro.', '/navrhy/' || p.id
    );
  end loop;
end;
$$;
revoke execute on function public.close_expired_proposals from public, anon;
grant execute on function public.close_expired_proposals to authenticated;

-- Vrácení omylem uzavřeného návrhu; neprošlý dostane nových 7 dní hlasování.
create or replace function public.reopen_proposal(proposal uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Jen vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  update public.proposals
  set voting_ends_at = case when status = 'neproslo' then now() + interval '7 days' else voting_ends_at end,
      status = 'open', resolution = null, resolved_by = null, resolved_at = null
  where id = proposal;
end;
$$;
