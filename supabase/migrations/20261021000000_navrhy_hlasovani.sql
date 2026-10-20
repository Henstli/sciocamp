-- Návrhy a Hlasování (etapa 4).
--
-- Návrhy: kdokoli ze školy podá návrh se zvoleným cílem — projednat na
-- shromáždění, nebo předložit vyučujícím ke schválení — a navrhne, kolik
-- podporovatelů je potřeba. Vyučující nebo admin počet potvrdí či upraví.
-- Výsledek: „projednáno“ se závěrem, nebo „schváleno“ / „zamítnuto“ se
-- zdůvodněním. Autor a podporovatelé dostanou oznámení.
--
-- Hlasování: přání nových ateliérů, expedic a témat kurzů. Hlas „Chci to“
-- jedním klikem, počty bez jmen. Vyučující přání propojí se skutečnou
-- aktivitou → „Vypsáno“ a oznámení všem, kdo chtěli.

-- ---------------------------------------------------------------------------
-- Návrhy
-- ---------------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  category text not null default 'jine' check (category in ('vyuka', 'rozvrh', 'expedice', 'prostory', 'jine')),
  goal text not null check (goal in ('shromazdeni', 'schvaleni')),
  -- Kolik podporovatelů navrhl autor, a kolik potvrdil vyučující (null = čeká).
  need_proposed integer not null check (need_proposed between 1 and 500),
  need integer check (need between 1 and 500),
  need_set_by uuid references public.profiles (id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'projednano', 'schvaleno', 'zamitnuto', 'stazeno')),
  resolution text check (char_length(resolution) <= 4000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  support_count integer not null default 0,
  -- Kdy návrh poprvé dosáhl potřebné podpory.
  reached_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'projednano' or goal = 'shromazdeni'),
  check (status <> 'schvaleno' or goal = 'schvaleni')
);
create index proposals_created_idx on public.proposals (created_at desc);
comment on table public.proposals is 'Návrhy studentů a učitelů (shromáždění nebo schválení vyučujícími).';

create table public.proposal_supports (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);
create index proposal_supports_user_idx on public.proposal_supports (user_id);

create table public.proposal_comments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index proposal_comments_idx on public.proposal_comments (proposal_id, created_at);

alter table public.proposals enable row level security;
alter table public.proposal_supports enable row level security;
alter table public.proposal_comments enable row level security;

-- Návrhy, podpory i komentáře vidí celá škola (návrhy jsou pod jménem).
create policy "návrhy: čtou členové" on public.proposals for select to authenticated
  using (public.is_member());
create policy "návrhy: podává každý sám za sebe" on public.proposals for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member());
-- Autor může upravit text, dokud je návrh otevřený.
create policy "návrhy: autor upravuje otevřený" on public.proposals for update to authenticated
  using (author_id = (select auth.uid()) and status = 'open')
  with check (author_id = (select auth.uid()) and status = 'open');
create policy "návrhy: maže admin" on public.proposals for delete to authenticated
  using (public.is_admin());

-- Stav, počet a výsledek mění jen funkce níže; přímo jen tyto sloupce.
revoke insert, update on public.proposals from authenticated;
grant select, delete on public.proposals to authenticated;
grant insert (title, body, category, goal, need_proposed) on public.proposals to authenticated;
grant update (title, body, category) on public.proposals to authenticated;

create policy "podpora: čtou členové" on public.proposal_supports for select to authenticated
  using (public.is_member());
create policy "podpora: každý za sebe u otevřeného" on public.proposal_supports for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.is_member()
    and exists (select 1 from public.proposals p where p.id = proposal_id and p.status = 'open')
  );
-- Autor svou podporu odebrat nemůže (návrh podporuje vždy).
create policy "podpora: odebrat svou u otevřeného" on public.proposal_supports for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.proposals p where p.id = proposal_id and p.status = 'open' and p.author_id <> proposal_supports.user_id)
  );
revoke update on public.proposal_supports from authenticated;
grant select, insert, delete on public.proposal_supports to authenticated;

create policy "komentáře návrhů: čtou členové" on public.proposal_comments for select to authenticated
  using (public.is_member());
create policy "komentáře návrhů: píše každý sám za sebe" on public.proposal_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member());
create policy "komentáře návrhů: maže autor nebo admin" on public.proposal_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());
revoke update on public.proposal_comments from authenticated;
grant select, insert, delete on public.proposal_comments to authenticated;

/** Podporovatelé návrhu (včetně autora). */
create function public.proposal_people(proposal uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(s.user_id), '{}') from public.proposal_supports s where s.proposal_id = proposal
$$;

/** Přepočítá podporu; při prvním dosažení počtu pošle oznámení autorovi a vyučujícím. */
create function public.proposal_recount(proposal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
  n integer;
begin
  select count(*) into n from public.proposal_supports where proposal_id = proposal;
  update public.proposals set support_count = n where id = proposal returning * into p;
  if p.id is null or p.status <> 'open' or p.need is null or n < p.need or p.reached_at is not null then
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
    p.title || ' (' || n || ' podporovatelů)',
    '/navrhy/' || p.id
  );
end;
$$;

create function public.after_proposal_support() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.proposal_recount(coalesce(new.proposal_id, old.proposal_id));
  return null;
end;
$$;
create trigger proposal_support_count after insert or delete on public.proposal_supports
  for each row execute function public.after_proposal_support();

-- Autor svůj návrh rovnou podporuje.
create function public.after_proposal_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.proposal_supports (proposal_id, user_id) values (new.id, new.author_id)
  on conflict do nothing;
  perform public.notify(
    (select array_agg(id) from public.profiles where role in ('ucitel', 'admin') and not blocked),
    'navrh',
    'Nový návrh: potvrď počet podporovatelů',
    new.title || ' — autor navrhuje ' || new.need_proposed || '.',
    '/navrhy/' || new.id
  );
  return null;
end;
$$;
create trigger proposal_author_support after insert on public.proposals
  for each row execute function public.after_proposal_insert();

-- Komentář: oznámení autorovi návrhu.
create function public.after_proposal_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
begin
  select * into p from public.proposals where id = new.proposal_id;
  perform public.notify(
    array[p.author_id], 'komentar',
    public.profile_name(new.author_id) || ' komentuje tvůj návrh',
    left(new.body, 140), '/navrhy/' || p.id
  );
  return null;
end;
$$;
create trigger proposal_comment_notify after insert on public.proposal_comments
  for each row execute function public.after_proposal_comment();

/** Vyučující nebo admin potvrdí / upraví potřebný počet podporovatelů. */
create function public.set_proposal_need(proposal uuid, n integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
begin
  if not public.is_staff() then
    raise exception 'Počet podporovatelů potvrzuje vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  if n is null or n < 1 or n > 500 then
    raise exception 'Počet musí být 1 až 500.' using errcode = 'check_violation';
  end if;
  update public.proposals set need = n, need_set_by = auth.uid(),
    -- Při zvýšení počtu nad současnou podporu se „dosaženo“ vrátí.
    reached_at = case when support_count >= n then reached_at else null end
  where id = proposal and status = 'open'
  returning * into p;
  if p.id is null then
    raise exception 'Návrh už je uzavřený.' using errcode = 'check_violation';
  end if;
  perform public.notify(
    array[p.author_id], 'navrh',
    case when n = p.need_proposed then 'Počet podporovatelů potvrzen' else 'Počet podporovatelů upraven' end,
    p.title || ' — potřeba ' || n || '.',
    '/navrhy/' || p.id
  );
  perform public.proposal_recount(proposal);
end;
$$;

/** Výsledek návrhu: projednano (závěr), schvaleno / zamitnuto (zdůvodnění). */
create function public.resolve_proposal(proposal uuid, result text, note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
begin
  if not public.is_staff() then
    raise exception 'O návrhu rozhoduje vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  if result not in ('projednano', 'schvaleno', 'zamitnuto') then
    raise exception 'Neznámý výsledek.' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(note), '') = '' then
    raise exception 'Napiš závěr nebo zdůvodnění.' using errcode = 'check_violation';
  end if;
  update public.proposals
  set status = result, resolution = btrim(note), resolved_by = auth.uid(), resolved_at = now()
  where id = proposal and status = 'open'
  returning * into p;
  if p.id is null then
    raise exception 'Návrh už je uzavřený.' using errcode = 'check_violation';
  end if;
  perform public.notify(
    public.proposal_people(proposal), 'navrh',
    case result
      when 'projednano' then 'Návrh projednán'
      when 'schvaleno' then 'Návrh schválen'
      else 'Návrh zamítnut'
    end || ': ' || p.title,
    left(p.resolution, 140),
    '/navrhy/' || p.id
  );
end;
$$;

/** Autor stáhne svůj otevřený návrh. */
create function public.withdraw_proposal(proposal uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.proposals set status = 'stazeno', resolved_by = auth.uid(), resolved_at = now()
  where id = proposal and status = 'open' and author_id = auth.uid();
  if not found then
    raise exception 'Stáhnout jde jen vlastní otevřený návrh.' using errcode = 'check_violation';
  end if;
end;
$$;

/** Vyučující vrátí uzavřený návrh zpět mezi otevřené (omyl při rozhodnutí). */
create function public.reopen_proposal(proposal uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Jen vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  update public.proposals set status = 'open', resolution = null, resolved_by = null, resolved_at = null
  where id = proposal;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hlasování: přání nových ateliérů, expedic a témat kurzů
-- ---------------------------------------------------------------------------

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('atelier', 'expedice', 'kurz')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  status text not null default 'open' check (status in ('open', 'vypsano', 'uzavreno')),
  activity_id uuid references public.activities (id) on delete set null,
  note text check (char_length(note) <= 2000),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  vote_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index wishes_votes_idx on public.wishes (status, vote_count desc);
comment on table public.wishes is 'Přání nových ateliérů, expedic a témat kurzů (Hlasování).';

create table public.wish_votes (
  wish_id uuid not null references public.wishes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wish_id, user_id)
);
create index wish_votes_user_idx on public.wish_votes (user_id);

alter table public.wishes enable row level security;
alter table public.wish_votes enable row level security;

create policy "přání: čtou členové" on public.wishes for select to authenticated
  using (public.is_member());
create policy "přání: přidává každý sám za sebe" on public.wishes for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member());
create policy "přání: autor upravuje otevřené" on public.wishes for update to authenticated
  using (author_id = (select auth.uid()) and status = 'open')
  with check (author_id = (select auth.uid()) and status = 'open');
-- Autor smaže své přání, dokud ho nikdo další nechce; admin kdykoli.
create policy "přání: maže autor bez hlasů nebo admin" on public.wishes for delete to authenticated
  using (public.is_admin() or (author_id = (select auth.uid()) and status = 'open' and vote_count <= 1));
revoke insert, update on public.wishes from authenticated;
grant select, delete on public.wishes to authenticated;
grant insert (kind, title, body) on public.wishes to authenticated;
grant update (kind, title, body) on public.wishes to authenticated;

-- Hlasy jsou anonymní: každý vidí jen ty svoje, počty jsou ve wishes.vote_count.
create policy "hlasy: vidí každý svoje" on public.wish_votes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "hlasy: každý za sebe u otevřeného" on public.wish_votes for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.is_member()
    and exists (select 1 from public.wishes w where w.id = wish_id and w.status = 'open')
  );
create policy "hlasy: odebrat svůj u otevřeného" on public.wish_votes for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.wishes w where w.id = wish_id and w.status = 'open')
  );
revoke update on public.wish_votes from authenticated;
grant select, insert, delete on public.wish_votes to authenticated;

create function public.after_wish_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  w uuid := coalesce(new.wish_id, old.wish_id);
begin
  update public.wishes set vote_count = (select count(*) from public.wish_votes where wish_id = w) where id = w;
  return null;
end;
$$;
create trigger wish_vote_count after insert or delete on public.wish_votes
  for each row execute function public.after_wish_vote();

-- Autor své přání rovnou chce.
create function public.after_wish_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.wish_votes (wish_id, user_id) values (new.id, new.author_id) on conflict do nothing;
  return null;
end;
$$;
create trigger wish_author_vote after insert on public.wishes
  for each row execute function public.after_wish_insert();

/** Vyučující propojí přání se skutečnou aktivitou → „Vypsáno“ a oznámení všem, kdo chtěli. */
create function public.fulfil_wish(wish uuid, activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wishes;
  a public.activities;
begin
  if not public.is_staff() then
    raise exception 'Přání vypisuje vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.activities where id = activity;
  if a.id is null then
    raise exception 'Aktivita neexistuje.' using errcode = 'check_violation';
  end if;
  update public.wishes
  set status = 'vypsano', activity_id = activity, closed_by = auth.uid(), closed_at = now(), note = null
  where id = wish and status = 'open'
  returning * into w;
  if w.id is null then
    raise exception 'Přání už je uzavřené.' using errcode = 'check_violation';
  end if;
  perform public.notify(
    (select array_agg(user_id) from public.wish_votes where wish_id = wish),
    'prani',
    'Vypsáno: ' || a.title,
    'Přání „' || w.title || '“ se splnilo. Zápis najdeš v Zápisech, až bude otevřený.',
    public.class_href(a.id)
  );
end;
$$;

/** Vyučující přání uzavře bez vypsání (např. duplicita, nejde zařídit) se zdůvodněním. */
create function public.close_wish(wish uuid, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wishes;
begin
  if not public.is_staff() then
    raise exception 'Přání uzavírá vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(reason), '') = '' then
    raise exception 'Napiš zdůvodnění.' using errcode = 'check_violation';
  end if;
  update public.wishes
  set status = 'uzavreno', note = btrim(reason), closed_by = auth.uid(), closed_at = now()
  where id = wish and status = 'open'
  returning * into w;
  if w.id is null then
    raise exception 'Přání už je uzavřené.' using errcode = 'check_violation';
  end if;
  perform public.notify(
    (select array_agg(user_id) from public.wish_votes where wish_id = wish),
    'prani', 'Přání uzavřeno: ' || w.title, left(w.note, 140), '/hlasovani'
  );
end;
$$;

/** Vrátí uzavřené / vypsané přání zpět do hlasování (omyl). */
create function public.reopen_wish(wish uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Jen vyučující nebo admin.' using errcode = 'insufficient_privilege';
  end if;
  update public.wishes set status = 'open', activity_id = null, note = null, closed_by = null, closed_at = null
  where id = wish;
end;
$$;

revoke execute on function public.proposal_people, public.proposal_recount, public.after_proposal_support,
  public.after_proposal_insert, public.after_proposal_comment, public.after_wish_vote, public.after_wish_insert
  from public, anon, authenticated;
revoke execute on function public.set_proposal_need, public.resolve_proposal, public.withdraw_proposal,
  public.reopen_proposal, public.fulfil_wish, public.close_wish, public.reopen_wish from public, anon;
grant execute on function public.set_proposal_need, public.resolve_proposal, public.withdraw_proposal,
  public.reopen_proposal, public.fulfil_wish, public.close_wish, public.reopen_wish to authenticated;
