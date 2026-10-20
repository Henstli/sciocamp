-- Soukromé zprávy: stav Odesláno / Doručeno / Přečteno.
-- Doručeno = příjemce měl po odeslání otevřenou aplikaci (zvoneček v hlavičce
-- volá mark_messages_delivered); Přečteno = last_read_at (otevřel konverzaci).
-- Odesílatel vidí změny živě (Realtime na conversation_members).

alter table public.conversation_members add column delivered_at timestamptz not null default now();
comment on column public.conversation_members.delivered_at is 'Kdy měl člen naposledy zprávy doručené (aplikace otevřená).';
grant update (last_read_at, delivered_at) on public.conversation_members to authenticated;

/** Označí zprávy přihlášeného jako doručené (jen konverzace s novějšími zprávami). */
create function public.mark_messages_delivered() returns void
language sql security invoker set search_path = '' as $$
  update public.conversation_members m set delivered_at = now()
  from public.conversations c
  where c.id = m.conversation_id and m.user_id = (select auth.uid()) and c.last_message_at > m.delivered_at
$$;
revoke execute on function public.mark_messages_delivered from public, anon;
grant execute on function public.mark_messages_delivered to authenticated;

alter publication supabase_realtime add table public.conversation_members;
