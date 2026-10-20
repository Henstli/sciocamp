-- Kdo je online: soukromý Realtime kanál „online“ (Presence). Připojit se a vidět,
-- kdo je přihlášený, smí jen členové školy (RLS na realtime.messages).
-- V testovací databázi (PGlite) schéma realtime není, proto podmínka.

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy "online: členové školy vidí" on realtime.messages
        for select to authenticated
        using (realtime.topic() = 'online' and extension = 'presence' and public.is_member())
    $p$;
    execute $p$
      create policy "online: členové školy hlásí" on realtime.messages
        for insert to authenticated
        with check (realtime.topic() = 'online' and extension = 'presence' and public.is_member())
    $p$;
  end if;
end
$$;
