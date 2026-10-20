-- Povinné hlasování: admin u návrhu „pošle hlasování všem“. Dokud člověk
-- nehlasuje (jakkoli, i „je mi to jedno“), aplikace po něm hlas chce na každé
-- stránce. Povinnost končí s koncem hlasování nebo ji admin zruší.

alter table public.proposals add column mandatory_at timestamptz;
comment on column public.proposals.mandatory_at is 'Kdy admin poslal hlasování všem (null = dobrovolné).';

/** Admin zapne / vypne povinné hlasování; při zapnutí dostanou všichni oznámení. */
create function public.set_proposal_mandatory(proposal uuid, on_ boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
begin
  if not public.is_admin() then
    raise exception 'Hlasování všem posílá jen admin.' using errcode = 'insufficient_privilege';
  end if;
  update public.proposals set mandatory_at = case when on_ then coalesce(mandatory_at, now()) else null end
  where id = proposal and status = 'open' and voting_ends_at > now()
  returning * into p;
  if p.id is null then
    raise exception 'Hlasování o návrhu už skončilo.' using errcode = 'check_violation';
  end if;
  if on_ then
    perform public.notify(
      (select array_agg(pr.id) from public.profiles pr
       where not pr.blocked
         and not exists (select 1 from public.proposal_supports s where s.proposal_id = p.id and s.user_id = pr.id)),
      'navrh', 'Hlasuj o návrhu: ' || p.title, 'Hlasování je povinné pro všechny.', '/navrhy/' || p.id
    );
  end if;
end;
$$;
revoke execute on function public.set_proposal_mandatory from public, anon;
grant execute on function public.set_proposal_mandatory to authenticated;
